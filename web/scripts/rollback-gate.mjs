// Fail closed while a previous bundle reads current data. Existing sessions may browse and sign out.
const reads=new Set(['info','state','members','stats','sop','health','wechat/status']);
export async function rollbackGate(request,enabled,sealed=false){
 if(!enabled)return null;const path=new URL(request.url).pathname;
 // A previous bundle may not understand review isolation. Never let it read sealed data.
 if(sealed){const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},info={version:'v1.0.6',initialized:true,user:null,reviewMode:true,departments:['办公室','新媒体运营部','视觉传达部','创意设计部']},error={error:'审核数据已封存，请管理员恢复当前程序版本后再登录。',code:'REVIEW_ROLLBACK_GUARD'};
  if(path==='/mini/api'){let body;try{body=await request.clone().json()}catch{return new Response(JSON.stringify({status:400,body:{error:'请求格式不正确'}}),{status:200,headers})}return new Response(JSON.stringify(body.path==='info'?{status:200,body:info}:{status:409,body:error}),{status:200,headers})}
  if(path==='/api/info')return new Response(JSON.stringify(info),{status:200,headers});
  if(path.startsWith('/api/')||path==='/sop-docs.json'||path.startsWith('/guide/'))return new Response(JSON.stringify(error),{status:409,headers});
 }
 if(request.method!=='POST')return null;
 const error={error:'程序已回退为只读浏览，请管理员修复并重新启动新版后再操作。',code:'ROLLBACK_READONLY'};
 if(path==='/mini/api'){let payload;try{payload=await request.clone().json()}catch{return null}if(reads.has(payload.path)||payload.path==='logout')return null;return new Response(JSON.stringify({status:409,body:error}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
 if(path==='/api/logout')return null;
 if(path.startsWith('/api/'))return new Response(JSON.stringify(error),{status:409,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 return null;
}
