import { NextResponse } from 'next/server';

// Only viewport tiles are fetched. No prefetch/offline downloads, arbitrary URLs,
// credentials or operational data are forwarded to the public tile service.
export async function GET(request: Request, context: {params: Promise<{z:string;x:string;y:string}>}) {
  const {z,x,y}=await context.params;
  if(![z,x,y].every(value=>/^\d{1,8}$/.test(value))) return new NextResponse(null,{status:400});
  const zoom=Number(z),column=Number(x),row=Number(y);
  if(zoom>19||column>=2**zoom||row>=2**zoom) return new NextResponse(null,{status:400});
  try {
    const upstream=await fetch(`https://tile.openstreetmap.org/${zoom}/${column}/${row}.png`,{
      headers:{'User-Agent':'FUTA-EV-Dispatch/1.0 (+https://futa-ev-dispatch.vercel.app)',Referer:request.headers.get('referer')||new URL(request.url).origin+'/'},
      next:{revalidate:604800},signal:AbortSignal.timeout(12000),
    });
    if(!upstream.ok||!upstream.headers.get('content-type')?.startsWith('image/png')) return new NextResponse(null,{status:502,headers:{'Cache-Control':'no-store'}});
    return new NextResponse(await upstream.arrayBuffer(),{headers:{'Content-Type':'image/png','Cache-Control':upstream.headers.get('cache-control')||'public, max-age=604800','X-Content-Type-Options':'nosniff'}});
  }catch{return NextResponse.json({error:{message:'Không kết nối được máy chủ bản đồ.'}},{status:502,headers:{'Cache-Control':'no-store'}})}
}
