import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext, UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

const maxBytes = 8 * 1024 * 1024; const types = new Set(['image/jpeg', 'image/png', 'image/webp']);
const asNumber = (value: FormDataEntryValue | null) => typeof value === 'string' && Number.isFinite(Number(value)) ? Number(value) : null;
const pathPart = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'khong-xac-dinh';
const vietnamDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

export async function GET(request: Request) {
  try { const actor = await getCurrentUserContext(); const db = createServiceRoleClient(); const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase(); let query = db.from('work_sessions').select('id,profile_id,checked_in_at,checked_out_at,note,profiles!work_sessions_profile_id_fkey(full_name,employee_code,role)').order('checked_in_at', { ascending: false }).limit(500); if (!['admin', 'dieu_do', 'dieu_phoi'].includes(actor.role)) query = query.eq('profile_id', actor.userId); const { data, error } = await query; if (error) throw error; const sessions = (data ?? []).filter((session: any) => !q || `${session.profiles?.full_name ?? ''} ${session.profiles?.employee_code ?? ''}`.toLowerCase().includes(q)); return NextResponse.json({ sessions, actorId: actor.userId, actorName: actor.fullName, actorRole: actor.role }); }
  catch (caught) { return NextResponse.json({ error: { message: caught instanceof UnauthenticatedError ? 'Đăng nhập lại.' : caught instanceof Error ? caught.message : 'Không tải được chấm công.' } }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentUserContext(); const form = await request.formData(); const action = form.get('action'); const photos = form.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0); const latitude = asNumber(form.get('latitude')); const longitude = asNumber(form.get('longitude'));
    if (action !== 'in' && action !== 'out') throw new Error('Thao tác không hợp lệ.'); if (!photos.length) throw new Error('Chấm công cần ít nhất một ảnh.'); if (photos.some((photo) => photo.size > maxBytes || !types.has(photo.type))) throw new Error('Ảnh phải là JPG, PNG hoặc WebP và không quá 8 MB.'); if (latitude === null || longitude === null) throw new Error('Hãy cấp quyền GPS trước khi chấm công.');
    const db = createServiceRoleClient(); const { data: profile, error: profileError } = await db.from('profiles').select('employee_code,full_name').eq('id', actor.userId).single(); if (profileError || !profile) throw profileError ?? new Error('Không tìm thấy thông tin nhân viên.'); const { data: plan } = await db.from('daily_plans').select('id').order('service_date', { ascending: false }).limit(1).maybeSingle(); let session: any;
    if (action === 'in') { const result = await db.from('work_sessions').insert({ profile_id: actor.userId, daily_plan_id: plan?.id ?? null, check_in_latitude: latitude, check_in_longitude: longitude }).select().single(); if (result.error) throw result.error; session = result.data; }
    else { const result = await db.from('work_sessions').update({ checked_out_at: new Date().toISOString(), check_out_latitude: latitude, check_out_longitude: longitude }).eq('profile_id', actor.userId).is('checked_out_at', null).select().maybeSingle(); if (result.error) throw result.error; if (!result.data) throw new Error('Không có phiên làm việc đang mở.'); session = result.data; }
    const person = pathPart(`${profile.employee_code}-${profile.full_name}`); const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const uploaded: { path: string; photo: File }[] = [];
    for (const photo of photos) { const path = `${vietnamDate()}/${person}/${action}/${stamp}-${crypto.randomUUID()}.webp`; const upload = await db.storage.from('attendance-proof').upload(path, photo, { contentType: photo.type, upsert: false }); if (upload.error) throw upload.error; uploaded.push({ path, photo }); }
    const record = await db.from('work_session_photos').insert(uploaded.map((photo) => ({ work_session_id: session.id, action, storage_path: photo.path, mime_type: photo.photo.type, bytes: photo.photo.size, latitude, longitude }))); if (record.error) throw record.error;
    return NextResponse.json({ session, photoCount: uploaded.length });
  } catch (caught) { return NextResponse.json({ error: { message: caught instanceof Error ? caught.message : 'Không thể chấm công.' } }, { status: 400 }); }
}
