import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker from '../dist/server/index.js';
import {database} from './local-db.mjs';
import {createMiniGateway} from './mini-gateway.mjs';
const DB=database();for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')))DB.sqlite.exec(await readFile('drizzle/'+f,'utf8'));
const origin='https://privacy.test',password='Fixture-password-31-strong',env={DB,BOOTSTRAP_HASH:createHash('sha256').update('fixture-setup').digest('hex')};let ip=0;
async function call(path,data,cookie='',status=200,headers={}){const res=await worker.fetch(new Request(origin+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,'X-FR-Request':'1','Content-Type':'application/json',Cookie:cookie,'CF-Connecting-IP':String(++ip),...headers},body:data?JSON.stringify(data):undefined}),env);const body=await res.json();assert.equal(res.status,status,path+': '+JSON.stringify(body));return{body,cookie:res.headers.get('set-cookie')?.split(';')[0]||cookie}}
const owner=await call('setup',{token:'fixture-setup',username:'owner',name:'Fixture owner',dept:'办公室',password});
async function member(username,dept){const token=(await call('invite',{dept,role:'member'},owner.cookie)).body.token;return call('register',{username,name:username,dept,password,invite:token})}
const office=await member('office','办公室'),design=await member('design','创意设计部');
const adminState=(await call('state',null,owner.cookie)).body,oid=adminState.user.id,did=(await call('info',null,design.cookie)).body.user.id;
const privateId=(await call('events/create',{name:'PRIVATE_EVENT',description:'PRIVATE_DESCRIPTION',cloudUrl:'https://example.invalid/private-assets',date:'2026-10-10',department:'办公室'},owner.cookie)).body.id;
await call('tasks/create',{event:privateId,name:'PRIVATE_TASK',requirements:'PRIVATE_REQUIREMENTS',owner:oid,receiver:oid,due:'2026-10-10T18:00'},owner.cookie);
const publicId=(await call('events/create',{name:'Team event',date:'2026-10-11'},owner.cookie)).body.id;
const assigned=(await call('tasks/create',{event:publicId,name:'Assigned task',requirements:'Assigned requirements',owner:did,receiver:oid,due:'2026-10-11T18:00'},owner.cookie)).body.id;
let state=(await call('state',null,design.cookie)).body;
assert.ok(state.events.some(e=>e.id===publicId));assert.ok(state.tasks.some(t=>t.id===assigned));assert.ok(!JSON.stringify(state).includes('PRIVATE_'));
assert.ok((await call('state',null,office.cookie)).body.events.some(e=>e.id===privateId));assert.ok((await call('state',null,owner.cookie)).body.events.some(e=>e.id===privateId));
await call('settings/save',{workspace:'办公室'},design.cookie);state=(await call('state',null,design.cookie)).body;assert.equal(state.events.length,0);assert.equal(state.tasks.length,0);assert.ok(!JSON.stringify(state).includes('PRIVATE_'));await call('settings/save',{workspace:''},design.cookie);
await call('events/delete',{id:privateId},owner.cookie);state=(await call('state',null,design.cookie)).body;assert.ok(!JSON.stringify(state).includes('PRIVATE_'),'deleted private event notice stays private');
// Legacy notifications from deleted events have no audience metadata.
const row=DB.sqlite.prepare('SELECT data FROM workspace WHERE id=1').get(),stored=JSON.parse(row.data);stored.notices.unshift({text:'已删除活动「LEGACY_PRIVATE_EVENT」',target:'all'});DB.sqlite.prepare('UPDATE workspace SET data=? WHERE id=1').run(JSON.stringify(stored));assert.ok(!JSON.stringify((await call('state',null,design.cookie)).body).includes('LEGACY_PRIVATE_EVENT'));
for(const path of ['state','members'])await call(path,null,'',401);assert.equal((await call('info',null)).body.user,null);
await call('tasks/action',{id:assigned,action:'approve'},design.cookie,403);await call('invite',{dept:'办公室',role:'member'},owner.cookie,403,{Origin:'https://attacker.invalid'});
const hash=DB.sqlite.prepare('SELECT password FROM users WHERE id=?').get(oid).password;assert.ok(!JSON.stringify(state).includes(hash));assert.ok(!JSON.stringify((await call('members',null,design.cookie)).body).includes('password'));
const mini=createMiniGateway({worker,DB});
for(const token of ['bad\r\nCookie: attacker',123,null,'a'.repeat(65)]){const res=await mini(new Request(origin+'/mini/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'state',token})}),env);assert.equal((await res.json()).status,400)}
for(const resource of ['/sop-docs.json','/.env','/.local/preview.db']){const res=await worker.fetch(new Request(origin+resource),env);assert.equal(res.status,resource==='/sop-docs.json'?401:404)}
const startup=await readFile('scripts/dev.mjs','utf8');assert.ok(!startup.includes('local-preview-only-setup'),'no public default initialization credential');
DB.sqlite.close();console.log('PASS: department event and notification isolation, deleted/legacy notices, assigned tasks, anonymous data denial, CSRF, hashed passwords, gateway token validation and no default setup credential.');
