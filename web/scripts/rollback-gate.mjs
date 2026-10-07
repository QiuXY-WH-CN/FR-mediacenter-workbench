// Fail closed while a previous bundle reads current data. Existing sessions may browse and sign out.
const reads=new Set(['info','state','members','stats','sop','health','wechat/status']);
export async function rollbackGate(request,enabled){
 if(!enabled||request.method!=='POST')return null;const path=new URL(request.url).pathname;
 const error={error:'程序已回退为只读浏览，请管理员修复并重新启动新版后再操作。',code:'ROLLBACK_READONLY'};
 if(path==='/mini/api'){let payload;try{payload=await request.clone().json()}catch{return null}if(reads.has(payload.path)||payload.path==='logout')return null;return new Response(JSON.stringify({status:409,body:error}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
 if(path==='/api/logout')return null;
 if(path.startsWith('/api/'))return new Response(JSON.stringify(error),{status:409,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 return null;
}
