import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/infrastructure/supabase/server";
import { getCurrentUserContext } from "@/infrastructure/auth/getCurrentUserContext";
import { canPerform } from "@/shared/permissions/permissionMatrix";
import * as XLSX from "xlsx";
import { fetchAllPages } from "@/infrastructure/supabase/fetchAllPages";

export const runtime = "nodejs";
export async function GET() {
  const actor = await getCurrentUserContext();
  if (!canPerform(actor.role, "import_bang_tuyen_sheet"))
    return NextResponse.json(
      { error: { message: "Chỉ admin hoặc điều độ được xuất PA đậu đêm." } },
      { status: 403 },
    );
  const db = createServiceRoleClient();
  const { data: configs, error: configError } = await db
    .from("overnight_plan_configs")
    .select("id,version,effective_from,status,source_name,activated_at")
    .eq("status", "active")
    .order("effective_from", { ascending: false })
    .order("version", { ascending: false })
    .limit(1);
  const config = configs?.[0];
  if (configError)
    return NextResponse.json(
      { error: { message: configError.message } },
      { status: 500 },
    );
  if (!config)
    return NextResponse.json(
      { error: { message: "Chưa có PA đậu đêm cố định đang hiệu lực." } },
      { status: 404 },
    );
  const data = await fetchAllPages<any>((from, to) =>
    db
      .from("overnight_plan_config_ends")
      .select(
        "route_code,route_name,route_end_name,planned_vehicle_count,mobilization_minutes,buffer_minutes,note,depots(name),charging_stations(name)",
      )
      .eq("config_id", config.id)
      .order("route_code")
      .order("route_end_name")
      .range(from, to),
  );
  const rows = (data ?? []).map((row: any) => ({
    "Mã tuyến": row.route_code,
    "Tên tuyến": row.route_name,
    "Đầu bến": row.route_end_name,
    "Bãi đậu đêm": row.depots?.name ?? "",
    "Trạm sạc": row.charging_stations?.name ?? "",
    "Số xe PA": row.planned_vehicle_count,
    "Thời gian huy động (phút)": row.mobilization_minutes,
    "Buffer (phút)": row.buffer_minutes,
    "Ghi chú": row.note ?? "",
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows),
    "PA đậu đêm",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        "Phiên bản": config.version,
        "Hiệu lực từ": config.effective_from,
        "Trạng thái": config.status,
        "Nguồn import": config.source_name ?? "",
        "Kích hoạt lúc": config.activated_at ?? "",
      },
    ]),
    "Thông tin PA",
  );
  const body = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  });
  return new NextResponse(body, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":
        'attachment; filename="pa-dau-dem-dang-hieu-luc.xlsx"',
    },
  });
}
