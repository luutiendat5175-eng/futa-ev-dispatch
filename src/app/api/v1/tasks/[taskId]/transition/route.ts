import { NextResponse } from 'next/server';
import { createClient,createServiceRoleClient,createUserAccessTokenClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext,UnauthenticatedError } from '@/infrastructure/auth/getCurrentUserContext';

const MAX_PHOTO_BYTES=8*1024*1024,IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const fail=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status});
const asNumber=(value:FormDataEntryValue|null)=>typeof value==='string'&&Number.isFinite(Number(value))?Number(value):null;
const pathPart=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'khong-xac-dinh';
const vietnamDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
const friendly=(message?:string)=>message?.includes('TASK_INVALID_TRANSITION')?'Trạng thái xe không còn phù hợp. Danh sách đang được đồng bộ lại.':message?.includes('EMPLOYEE_ACTIVE_TASK')?'Bạn đang có một xe chưa hoàn tất. Hãy trả xe đó trước khi nhận xe tiếp theo.':message?.includes('TASK_ACTION_FORBIDDEN')?'Task này thuộc người khác hoặc bạn không còn quyền thao tác.':message??'Không thể cập nhật task.';

export async function POST(request:Request,context:{params:Promise<{taskId:string}>}){
  let actor;try{actor=await getCurrentUserContext()}catch(error){if(error instanceof UnauthenticatedError)return fail('UNAUTHENTICATED','Bạn cần đăng nhập để cập nhật task.',401);throw error}
  if(actor.role!=='lai_xe')return fail('TASK_TRANSITION_FORBIDDEN','Chỉ lái xe di dời được ghi nhận các bước thực hiện task.',403);
  const form=await request.formData(),nextStatus=form.get('nextStatus'),photos=form.getAll('photos').filter((item):item is File=>item instanceof File&&item.size>0),latitude=asNumber(form.get('latitude')),longitude=asNumber(form.get('longitude')),accuracy=asNumber(form.get('accuracy'));
  if(typeof nextStatus!=='string'||!nextStatus)return fail('STATUS_REQUIRED','Thiếu trạng thái đích.',400);if(!photos.length)return fail('PHOTO_REQUIRED','Mỗi thao tác phải kèm ít nhất một ảnh.',400);if(photos.some(photo=>!IMAGE_TYPES.has(photo.type)||photo.size>MAX_PHOTO_BYTES))return fail('INVALID_PHOTO','Mỗi ảnh phải là JPG, PNG hoặc WebP và không vượt quá 8 MB.',400);if(latitude===null||longitude===null||latitude< -90||latitude>90||longitude< -180||longitude>180)return fail('GPS_REQUIRED','Không nhận được GPS hợp lệ. Hãy bật quyền vị trí và thử lại.',400);
  const{taskId}=await context.params,service=createServiceRoleClient();const{data:task,error:taskError}=await service.from('dispatch_tasks').select('status,vehicles(license_plate)').eq('id',taskId).maybeSingle();if(taskError||!task)return fail('TASK_NOT_FOUND','Không tìm thấy task.',404);
  const vehicle=Array.isArray(task.vehicles)?task.vehicles[0]:task.vehicles,plate=pathPart((vehicle as{license_plate?:string}|null)?.license_plate??'chua-co-bien-so'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const planned=photos.map(photo=>({photo,storagePath:`${vietnamDate()}/${plate}/${pathPart(nextStatus)}/${stamp}-${crypto.randomUUID()}.webp`}));
  const uploads=await Promise.all(planned.map(async item=>({item,result:await service.storage.from('task-proof').upload(item.storagePath,item.photo,{contentType:item.photo.type,upsert:false})})));const succeeded=uploads.filter(row=>!row.result.error).map(row=>row.item);const uploadFailure=uploads.find(row=>row.result.error)?.result.error;if(uploadFailure){if(succeeded.length)await service.storage.from('task-proof').remove(succeeded.map(item=>item.storagePath));return fail('PHOTO_UPLOAD_FAILED',uploadFailure.message,500)}
  const token=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1],supabase=token?createUserAccessTokenClient(token):await createClient();const transition=(target:string)=>supabase.rpc('transition_dispatch_task',{p_task_id:taskId,p_next_status:target,p_latitude:latitude,p_longitude:longitude,p_accuracy_m:accuracy,p_note:null});
  let result=await transition(nextStatus);
  // Older databases require the legacy return intermediate state. Complete both
  // steps inside this single user action, using the same GPS and evidence.
  if(result.error?.message.includes('TASK_INVALID_TRANSITION')&&task.status==='nhan_tram_sac'&&nextStatus==='hoan_thanh'){
    const legacy=await transition('giao_dau_ben');if(!legacy.error)result=await transition('hoan_thanh');
  }
  if(result.error||!result.data){await service.storage.from('task-proof').remove(planned.map(item=>item.storagePath));return fail('TASK_TRANSITION_FAILED',friendly(result.error?.message),409)}
  const capturedAt=new Date().toISOString(),photoRecord=await service.from('task_event_photos').insert(planned.map(({storagePath,photo})=>({task_event_id:result.data.id,storage_path:storagePath,mime_type:photo.type,bytes:photo.size,captured_at:capturedAt,latitude,longitude})));if(photoRecord.error)return fail('PHOTO_AUDIT_FAILED','Đã lưu trạng thái nhưng chưa ghi được ảnh đối soát. Hãy báo admin.',500);
  return NextResponse.json({event:result.data,photoCount:planned.length,compatibilityFallback:task.status==='nhan_tram_sac'&&nextStatus==='hoan_thanh'});
}
