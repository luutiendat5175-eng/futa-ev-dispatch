import { NextRequest, NextResponse } from 'next/server';
import { parseDutyRosterSheet } from '@/domain/schedule/parseDutyRosterSheet';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';
import { canPerform } from '@/shared/permissions/permissionMatrix';

type Vehicle = { id: string; license_plate: string; vehicle_type_code: string | null };
type RouteEnd = { id: string; route_end_name: string; route_end_key: string; mobilization_minutes: number; buffer_minutes: number };
type NewVehicle = { licensePlate: string; vehicleTypeCode: string };
/** Compares operating names independently of case, accents, spacing and
 * replacement characters introduced by legacy Vietnamese CSV/Excel exports. */
const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[đð]/g, 'd')
  .replace(/[^a-z0-9]+/g, '')
  .replace(/[aeiouy]/g, '');

function parseNewVehicles(value: FormDataEntryValue | null): NewVehicle[] {
  if (!value || typeof value !== 'string') return [];
  try {
    const rows = JSON.parse(value);
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is NewVehicle => typeof row?.licensePlate === 'string' && typeof row?.vehicleTypeCode === 'string')
      .map((row) => ({ licensePlate: row.licensePlate.trim().toUpperCase(), vehicleTypeCode: row.vehicleTypeCode.trim().toUpperCase() }));
  } catch { return []; }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getCurrentUserContext();
    if (!canPerform(actor.role, 'import_bang_tuyen_sheet')) return NextResponse.json({ error: { message: 'Chỉ admin hoặc điều độ được import bảng tài.' } }, { status: 403 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: { message: 'Chọn file bảng tài trước khi import.' } }, { status: 400 });

    const parsed = parseDutyRosterSheet(Buffer.from(await file.arrayBuffer()), file.name);
    if (parsed.errors.length || !parsed.header) return NextResponse.json({ error: { message: parsed.errors.join(' ') || 'Không đọc được bảng tài.' } }, { status: 400 });
    const [day, month, year] = parsed.header.ngay.split('/');
    const dateInFile = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const selectedDate = String(form.get('serviceDate') ?? '').trim();
    if (selectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return NextResponse.json({ error: { message: 'Ngày vận doanh không đúng định dạng YYYY-MM-DD.' } }, { status: 400 });
    const serviceDate = selectedDate || dateInFile;
    const db = createServiceRoleClient();
    const { data: existingPlan, error: planError } = await db.from('daily_plans').select('id,status').eq('service_date', serviceDate).maybeSingle();
    let plan = existingPlan;
    let createdNewPlan = false;
    if (!plan && !planError) {
      const snapshot = await db.rpc('snapshot_active_overnight_config', { p_service_date: serviceDate, p_actor_id: actor.userId });
      if (snapshot.data) { plan = snapshot.data as { id: string; status: string }; createdNewPlan = true; }
      else {
        // Another dispatcher may have created the same operating day milliseconds earlier.
        const concurrent = await db.from('daily_plans').select('id,status').eq('service_date', serviceDate).maybeSingle();
        if (concurrent.data) plan = concurrent.data as { id: string; status: string };
        else {
          const { data: activeConfigs } = await db.from('overnight_plan_configs')
            .select('version,effective_from,source_name,activated_at')
            .eq('status', 'active')
            .order('effective_from', { ascending: false })
            .order('version', { ascending: false });
          const latest = activeConfigs?.[0] as { version: number; effective_from: string } | undefined;
          if (!latest) return NextResponse.json({ error: { message: `Không có PA đậu đêm nào ở trạng thái “active” cho ngày vận doanh ${serviceDate}. Import PA cố định và chọn “Hiệu lực từ” không muộn hơn ${serviceDate}.` } }, { status: 409 });
          if (latest.effective_from > serviceDate) return NextResponse.json({ error: { message: `PA active mới nhất là phiên bản ${latest.version}, hiệu lực từ ${latest.effective_from}; ngày này muộn hơn ngày vận doanh ${serviceDate}. Hãy chọn ngày vận doanh từ ${latest.effective_from} trở đi hoặc kích hoạt phiên bản PA phù hợp.` } }, { status: 409 });
          return NextResponse.json({ error: { message: `Không thể tạo snapshot từ PA phiên bản ${latest.version} (hiệu lực ${latest.effective_from}): ${snapshot.error?.message ?? 'lỗi không xác định'}.` } }, { status: 409 });
        }
      }
    }
    if (planError || !plan) return NextResponse.json({ error: { message: `Chưa tạo được PA áp dụng cho ngày ${serviceDate}.` } }, { status: 409 });
    if (plan.status === 'locked') return NextResponse.json({ error: { message: 'Kế hoạch đã khóa; chỉ admin được phép mở khóa hoặc đồng bộ lại.' } }, { status: 409 });
    if (createdNewPlan) {
      const { error: expireError } = await db.rpc('expire_prior_dispatch_tasks', { p_new_plan_id: plan.id, p_actor_id: actor.userId });
      if (expireError) throw new Error(`Không thể chốt task tồn của ngày trước: ${expireError.message}`);
    }

    const { data: routeEnds, error: routeEndError } = await db.from('plan_route_ends').select('id,route_end_name,route_end_key,mobilization_minutes,buffer_minutes').eq('daily_plan_id', plan.id).eq('route_code', parsed.header.mst);
    if (routeEndError || !routeEnds?.length) return NextResponse.json({ error: { message: `PA đậu đêm chưa có tuyến ${parsed.header.mst} cho ngày này.` } }, { status: 409 });
    const endByName = new Map<string, RouteEnd[]>();
    for (const end of routeEnds as RouteEnd[]) { const name = normalize(end.route_end_name); endByName.set(name, [...(endByName.get(name) ?? []), end]); }
    const missingEnds = [...new Set(parsed.trips.map((trip) => trip.diemDau).filter((name) => !endByName.has(normalize(name))))];
    if (missingEnds.length) return NextResponse.json({ error: {
      message: `Đầu bến không khớp PA đậu đêm: ${missingEnds.join(', ')}. Không có dữ liệu nào được ghi.`,
      details: [
        `Tuyến bảng tài: ${parsed.header.mst}.`,
        `Đầu bến đọc từ bảng tài: ${[...new Set(parsed.trips.map((trip) => trip.diemDau))].join(' | ')}.`,
        `Đầu bến trong snapshot PA đang dùng: ${(routeEnds as RouteEnd[]).map((end) => end.route_end_name).join(' | ')}.`,
        `Khóa đối chiếu bảng tài: ${[...new Set(parsed.trips.map((trip) => `${trip.diemDau} → ${normalize(trip.diemDau)}`))].join(' | ')}.`,
        `Khóa đối chiếu PA: ${(routeEnds as RouteEnd[]).map((end) => `${end.route_end_name} → ${normalize(end.route_end_name)}`).join(' | ')}.`,
        'Tên được đối chiếu không phân biệt hoa/thường, dấu tiếng Việt, khoảng trắng, ký tự “?” và ký tự Ð/Đ. Nếu khóa vẫn khác nhau, PA của ngày vận doanh này đang là phiên bản cũ và cần tạo lại snapshot trước khi import bảng tài.',
      ],
    } }, { status: 422 });

    const plates = [...new Set(parsed.trips.map((trip) => trip.bienSo))];
    const { data: vehicleRows } = await db.from('vehicles').select('id,license_plate,vehicle_type_code').in('license_plate', plates);
    let vehicles = (vehicleRows ?? []) as Vehicle[];
    const vehicleByPlate = new Map(vehicles.map((vehicle) => [vehicle.license_plate, vehicle]));
    const missingVehicles = plates.filter((plate) => !vehicleByPlate.has(plate));
    const confirmations = parseNewVehicles(form.get('newVehicles'));
    const confirmByPlate = new Map(confirmations.map((item) => [item.licensePlate, item]));
    const unconfirmed = missingVehicles.filter((plate) => !confirmByPlate.has(plate));
    if (unconfirmed.length) {
      const { data: types } = await db.from('vehicle_types').select('code').eq('is_active', true).order('code');
      return NextResponse.json({ needsVehicleConfirmation: true, missingVehicles: unconfirmed, vehicleTypes: (types ?? []).map((type: { code: string }) => type.code), message: 'Các xe này chưa có trong danh mục. Hãy chọn loại xe rồi xác nhận thêm mới.' }, { status: 422 });
    }
    if (missingVehicles.length) {
      const supplied = missingVehicles.map((plate) => confirmByPlate.get(plate)!);
      if (supplied.some((item) => !item.vehicleTypeCode)) return NextResponse.json({ error: { message: 'Phải chọn loại xe cho mọi xe mới.' } }, { status: 422 });
      const { data: types } = await db.from('vehicle_types').select('code').in('code', supplied.map((item) => item.vehicleTypeCode));
      const validCodes = new Set((types ?? []).map((item: { code: string }) => item.code));
      const invalid = supplied.filter((item) => !validCodes.has(item.vehicleTypeCode));
      if (invalid.length) return NextResponse.json({ error: { message: `Loại xe không hợp lệ: ${invalid.map((item) => item.vehicleTypeCode).join(', ')}` } }, { status: 422 });
      const { error: insertError } = await db.from('vehicles').insert(supplied.map((item) => ({ license_plate: item.licensePlate, vehicle_type_code: item.vehicleTypeCode })));
      if (insertError) throw insertError;
      const { data: reloaded } = await db.from('vehicles').select('id,license_plate,vehicle_type_code').in('license_plate', plates);
      vehicles = (reloaded ?? []) as Vehicle[];
    }

    const allVehicleByPlate = new Map(vehicles.map((vehicle) => [vehicle.license_plate, vehicle]));
    const typeCodes = [...new Set(vehicles.map((vehicle) => vehicle.vehicle_type_code).filter((code): code is string => Boolean(code)))];
    const { data: typeRows } = await db.from('vehicle_types').select('code,charge_minutes').in('code', typeCodes);
    const chargeMinutes = new Map<string, number>((typeRows ?? []).map((row: { code: string; charge_minutes: number }): [string, number] => [row.code, row.charge_minutes]));
    const noType = plates.filter((plate) => { const code = allVehicleByPlate.get(plate)?.vehicle_type_code; return !code || !chargeMinutes.has(code); });
    if (noType.length) return NextResponse.json({ error: { message: `Xe chưa có loại xe/thời gian sạc hợp lệ: ${noType.join(', ')}` } }, { status: 422 });

    // A physical bus may be listed at both ends of a route. It receives only one
    // overnight movement task: use its earliest departure of the operating day.
    const reduced = new Map<string, { end: RouteEnd; vehicle: Vehicle; departure: Date; sequence: number }>();
    for (const trip of parsed.trips) {
      const candidates = endByName.get(normalize(trip.diemDau)) ?? [];
      const end = candidates[trip.endOrdinal] ?? candidates[0]; const vehicle = allVehicleByPlate.get(trip.bienSo);
      if (!end || !vehicle) continue;
      const departure = new Date(`${serviceDate}T${trip.gioXB}:00+07:00`);
      const current = reduced.get(vehicle.id);
      if (!current || departure < current.departure || (departure.getTime() === current.departure.getTime() && trip.soTai < current.sequence)) {
        reduced.set(vehicle.id, { end, vehicle, departure, sequence: trip.soTai });
      }
    }
    // STT belongs to an individual endpoint, not to the source sheet globally.
    // Reindex after duplicate-vehicle reduction so each endpoint is 1, 2, 3…
    const perEnd = new Map<string, Array<{ end: RouteEnd; vehicle: Vehicle; departure: Date; sequence: number }>>();
    for (const item of reduced.values()) perEnd.set(item.end.id, [...(perEnd.get(item.end.id) ?? []), item]);
    const schedules = [...perEnd.values()].flatMap((items) => items
      .sort((a, b) => a.departure.getTime() - b.departure.getTime() || a.sequence - b.sequence)
      .map(({ end, vehicle, departure }, index) => ({
        vehicle_id: vehicle.id, plan_route_end_id: end.id,
        earliest_departure_at: departure.toISOString(),
        lct_at: new Date(departure.getTime() - ((chargeMinutes.get(vehicle.vehicle_type_code!) ?? 0) + end.mobilization_minutes + end.buffer_minutes) * 60_000).toISOString(),
        roster_sequence: index + 1, source_trip_count: 1,
      })));
    const { data: generated, error: replaceError } = await db.rpc('replace_route_roster', { p_daily_plan_id: plan.id, p_route_code: parsed.header.mst, p_schedules: schedules });
    if (replaceError) {
      const known: Record<string, string> = {
        ROUTE_HAS_CLAIMED_TASKS: `Tuyến ${parsed.header.mst} đã có task được nhận; không thể ghi đè để bảo toàn lịch sử.`,
        ROUTE_HAS_OPERATION_HISTORY: `Tuyến ${parsed.header.mst} đã có thao tác và ảnh/lịch sử liên quan; hệ thống không ghi đè để tránh mất dấu vết.`,
        VEHICLE_USED_BY_ANOTHER_ROUTE: 'Có xe trong bảng tài này đã thuộc task của tuyến khác cùng ngày. Hãy kiểm tra biển số bị trùng.',
        EMPTY_ROUTE_ROSTER: 'Bảng tài không có xe hợp lệ để tạo task.',
        DAILY_PLAN_LOCKED: 'Kế hoạch ngày này đã khóa; chỉ admin mới có thể mở khóa hoặc đồng bộ lại.',
      };
      return NextResponse.json({ error: { message: known[replaceError.message] ?? `Không thể import tuyến ${parsed.header.mst}: ${replaceError.message}` } }, { status: 409 });
    }
    const shiftStart = new Date(`${serviceDate}T00:00:00+07:00`);
    shiftStart.setUTCDate(shiftStart.getUTCDate() - 1);
    return NextResponse.json({ serviceDate, dateInFile, routeCode: parsed.header.mst, rowsRead: parsed.trips.length, vehicles: reduced.size, tasksGenerated: generated, addedVehicles: missingVehicles, message: `Đã import tuyến ${parsed.header.mst} cho ngày vận doanh ${serviceDate}. Ca làm việc là từ 18:00 ngày ${shiftStart.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })} đến 06:00 ${serviceDate}. Các tuyến khác của ngày này được giữ nguyên.` });
  } catch (error) {
    const status = error instanceof UnauthenticatedError ? 401 : 400;
    return NextResponse.json({ error: { message: error instanceof UnauthenticatedError ? 'Bạn cần đăng nhập lại.' : error instanceof Error ? error.message : 'Import bảng tài thất bại.' } }, { status });
  }
}
