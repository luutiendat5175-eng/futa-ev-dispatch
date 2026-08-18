import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient, createUserAccessTokenClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const error = (code: string, message: string, status: number) => NextResponse.json({ error: { code, message } }, { status });
const asNumber = (value: FormDataEntryValue | null) => typeof value === 'string' && Number.isFinite(Number(value)) ? Number(value) : null;
const pathPart = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'khong-xac-dinh';
const vietnamDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

export async function POST(request: Request, context: RouteContext<'/api/v1/tasks/[taskId]/transition'>) {
  let actor;
  try { actor = await getCurrentUserContext(); } catch (caught) { if (caught instanceof UnauthenticatedError) return error('UNAUTHENTICATED', 'Bạn cần đăng nhập để cập nhật task.', 401); throw caught; }
  if (actor.role !== 'lai_xe') return error('TASK_TRANSITION_FORBIDDEN', 'Chỉ lái xe di dời được ghi nhận các bước thực hiện task.', 403);
  const formData = await request.formData(); const nextStatus = formData.get('nextStatus'); const photos = formData.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0); const latitude = asNumber(formData.get('latitude')); const longitude = asNumber(formData.get('longitude')); const accuracy = asNumber(formData.get('accuracy'));
  if (typeof nextStatus !== 'string' || !nextStatus) return error('STATUS_REQUIRED', 'Thiếu trạng thái đích.', 400);
  if (!photos.length) return error('PHOTO_REQUIRED', 'Mỗi thao tác phải kèm ít nhất một ảnh.', 400);
  if (photos.some((photo) => !IMAGE_TYPES.has(photo.type) || photo.size > MAX_PHOTO_BYTES)) return error('INVALID_PHOTO', 'Mỗi ảnh phải là JPG, PNG hoặc WebP và không vượt quá 8 MB.', 400);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return error('GPS_REQUIRED', 'Không nhận được GPS hợp lệ. Hãy bật quyền vị trí và thử lại.', 400);
  const { taskId } = await context.params; const service = createServiceRoleClient();
  const { data: task, error: taskError } = await service.from('dispatch_tasks').select('vehicles(license_plate)').eq('id', taskId).maybeSingle();
  if (taskError || !task) return error('TASK_NOT_FOUND', 'Không tìm thấy task.', 404);
  const vehicle = Array.isArray(task.vehicles) ? task.vehicles[0] : task.vehicles;
  const plate = pathPart((vehicle as { license_plate?: string } | null)?.license_plate ?? 'chua-co-bien-so'); const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const uploaded: { storagePath: string; photo: File }[] = [];
  for (const photo of photos) {
    const storagePath = `${vietnamDate()}/${plate}/${pathPart(nextStatus)}/${stamp}-${crypto.randomUUID()}.webp`;
    const upload = await service.storage.from('task-proof').upload(storagePath, photo, { contentType: photo.type, upsert: false });
    if (upload.error) { if (uploaded.length) await service.storage.from('task-proof').remove(uploaded.map((item) => item.storagePath)); return error('PHOTO_UPLOAD_FAILED', upload.error.message, 500); }
    uploaded.push({ storagePath, photo });
  }
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]; const supabase = token ? createUserAccessTokenClient(token) : await createClient();
  const transition = await supabase.rpc('transition_dispatch_task', { p_task_id: taskId, p_next_status: nextStatus, p_latitude: latitude, p_longitude: longitude, p_accuracy_m: accuracy, p_note: null });
  if (transition.error || !transition.data) { await service.storage.from('task-proof').remove(uploaded.map((item) => item.storagePath)); return error('TASK_TRANSITION_FAILED', transition.error?.message ?? 'Không thể cập nhật task.', 409); }
  const capturedAt = new Date().toISOString(); const photoRecord = await service.from('task_event_photos').insert(uploaded.map(({ storagePath, photo }) => ({ task_event_id: transition.data.id, storage_path: storagePath, mime_type: photo.type, bytes: photo.size, captured_at: capturedAt, latitude, longitude })));
  if (photoRecord.error) return error('PHOTO_AUDIT_FAILED', 'Đã lưu trạng thái nhưng chưa ghi được ảnh đối soát. Hãy báo admin.', 500);
  return NextResponse.json({ event: transition.data, photoCount: uploaded.length });
}
