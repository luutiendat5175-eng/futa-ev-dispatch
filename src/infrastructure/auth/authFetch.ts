'use client';
import { createClient } from '@/infrastructure/supabase/client';
let tokenValue:string|null=null,tokenExpiresAt=0,sessionRequest:Promise<string|null>|null=null;
async function accessToken(forceRefresh=false){const now=Date.now();if(!forceRefresh&&tokenValue&&tokenExpiresAt-now>30000)return tokenValue;if(sessionRequest)return sessionRequest;const client=createClient();sessionRequest=(async()=>{const result=forceRefresh?await client.auth.refreshSession():await client.auth.getSession();tokenValue=result.data.session?.access_token??null;tokenExpiresAt=(result.data.session?.expires_at??0)*1000;return tokenValue})().finally(()=>{sessionRequest=null});return sessionRequest}
export async function authFetch(input:RequestInfo|URL,init:RequestInit={}){const request=async(refresh=false)=>{const headers=new Headers(init.headers),token=await accessToken(refresh);if(token)headers.set('Authorization',`Bearer ${token}`);return fetch(input,{...init,headers})};let response=await request();if(response.status===401)response=await request(true);
  // PA imports are first evaluated without writing. Replay the same FormData
  // only after the operator explicitly confirms the listed updates.
  if(response.status===409&&init.body instanceof FormData&&!init.body.has('confirmChanges')){try{const preview=await response.clone().json();if(preview.needsPaConfirmation){const details=Array.isArray(preview.details)?`\n\n${preview.details.slice(0,12).join('\n')}`:'';if(window.confirm(`${preview.message}${details}\n\nBạn có xác nhận cập nhật và kích hoạt phiên bản PA mới?`)){init.body.set('confirmChanges','true');response=await request()}}}catch{/* keep original response */}}
  return response}
