import assert from 'node:assert/strict';import {rollbackGate} from './rollback-gate.mjs';
const request=(path,data)=>new Request('http://127.0.0.1'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json'},body:data?JSON.stringify(data):undefined});
for(const p of ['login','tasks/action','settings/save','recover','setup','register','password','stats/maintenance']){const req=request('/api/'+p,{test:true}),r=await rollbackGate(req,true);assert.equal(r.status,409);assert.equal((await r.json()).code,'ROLLBACK_READONLY');assert.equal(await rollbackGate(req,false),null)}
for(const p of ['info','state','members','stats'])assert.equal(await rollbackGate(request('/api/'+p),true),null);assert.equal(await rollbackGate(request('/api/logout',{}),true),null);
for(const p of ['state','members','stats','logout'])assert.equal(await rollbackGate(request('/mini/api',{path:p}),true),null);
for(const p of ['tasks/action','login','wechat/login','recover']){const r=await rollbackGate(request('/mini/api',{path:p}),true);assert.equal(r.status,200);assert.equal((await r.json()).status,409)}
console.log('PASS rollback safety: current data stays read only; old code cannot bypass new login protection; existing sessions may browse and sign out; normal release unaffected.');
for(const p of ['/api/state','/api/members','/api/stats','/sop-docs.json','/guide/old.png'])assert.equal((await rollbackGate(request(p),true,true)).status,409);
const info=await(await rollbackGate(request('/api/info'),true,true)).json();assert.equal(info.user,null);assert.equal(info.reviewMode,true);
assert.equal((await(await rollbackGate(request('/mini/api',{path:'state'}),true,true)).json()).status,409);
assert.equal((await(await rollbackGate(request('/mini/api',{path:'info'}),true,true)).json()).body.user,null);
console.log('PASS review isolation survives a fallback to a bundle without review support.');
