const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
function load(file){const name=path.resolve(file);const mod=new Module(name,module);mod.filename=name;mod.paths=Module._nodeModulePaths(path.dirname(name));mod._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,name);return mod.exports}
async function main(){
  const {GET}=load('src/app/api/v1/map/tiles/[z]/[x]/[y]/route.ts');
  const originalFetch=global.fetch;let calls=0;
  try{
    global.fetch=async(url,options)=>{calls++;assert.equal(url,'https://tile.openstreetmap.org/11/1634/961.png');assert.match(options.headers['User-Agent'],/FUTA-EV-Dispatch/);assert.equal(options.headers.Referer,'https://futa-ev-dispatch.vercel.app/dashboard');assert.equal(options.next.revalidate,604800);return new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png','cache-control':'public, max-age=3600'}})};
    const request=new Request('https://futa-ev-dispatch.vercel.app/api/v1/map/tiles/11/1634/961',{headers:{referer:'https://futa-ev-dispatch.vercel.app/dashboard'}});
    for(const params of [{z:'20',x:'1',y:'1'},{z:'1',x:'2',y:'0'},{z:'-1',x:'0',y:'0'},{z:'11',x:'example.com',y:'0'}])assert.equal((await GET(request,{params:Promise.resolve(params)})).status,400);
    assert.equal(calls,0);
    const params=Promise.resolve({z:'11',x:'1634',y:'961'}),ok=await GET(request,{params});assert.equal(ok.status,200);assert.equal(ok.headers.get('content-type'),'image/png');assert.equal(ok.headers.get('cache-control'),'public, max-age=3600');assert.equal((await ok.arrayBuffer()).byteLength,4);
    global.fetch=async()=>new Response('error',{status:403});assert.equal((await GET(request,{params})).status,502);
    global.fetch=async()=>{throw Error('DNS failure')};const unavailable=await GET(request,{params});assert.equal(unavailable.status,502);assert.equal(unavailable.headers.get('cache-control'),'no-store');
  }finally{global.fetch=originalFetch}
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{DepotMultiFilter}=load('src/features/dispatch-tasks/DepotMultiFilter.tsx');
  const options=[{id:'a',name:'Quang Trung'},{id:'b',name:'Đỗ Mười'},{id:'c',name:'Linh Trung'}];
  const html=renderToStaticMarkup(React.createElement(DepotMultiFilter,{options,selected:['a','b'],onChange:()=>{}}));assert.equal((html.match(/checked=""/g)||[]).length,2);assert.match(html,/Đang chọn 2 bãi/);assert.match(html,/Quang Trung/);
  const all=renderToStaticMarkup(React.createElement(DepotMultiFilter,{options,selected:[],onChange:()=>{}}));assert.match(all,/tất cả bãi trong phạm vi/);
  console.log('PASS: tile validation/cache/error handling and multi-depot selection rendering');
}
main().catch(error=>{console.error(error);process.exitCode=1});
