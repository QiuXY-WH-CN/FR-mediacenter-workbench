import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import bcrypt from 'bcryptjs';
import worker from '../src/worker.js';
import {database} from './local-db.mjs';
import {createMiniGateway} from './mini-gateway.mjs';
import {setAccountReview} from './account-review.mjs';
import {onlineUsers} from '../src/presence.js';

const DB=database(),origin='https://review.test',password='Review-regression-password-47',hash=await bcrypt.hash(password,4),sha=s=>createHash('sha256').update(s).digest('hex');
for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())DB.sqlite.exec(await readFile('drizzle/'+file,'utf8'));
for(const [id,status,owner] of [['private-owner','active',1],['private-member','active',null],['private-pending','pending',null],['private-disabled','disabled',null]])DB.sqlite.prepare('INSERT INTO users (id,username,name,dept,role,status,password,owner,created) VALUES (?,?,?,?,?,?,?,?,?)').run(id,id,id+'姓名','办公室',owner?'admin':'member',status,hash,owner,Date.now());
const env={DB,DISABLE_TELEMETRY:true};let ip=0;
async function call(path,data,cookie='',status=200){const res=await worker.fetch(new Request(origin+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,'X-FR-Request':'1','Content-Type':'application/json',Cookie:cookie,'CF-Connecting-IP':'198.51.100.'+(++ip)},body:data?JSON.stringify(data):undefined}),env);const body=await res.json();assert.equal(res.status,status,path+': '+JSON.stringify(body));return {body,cookie:res.headers.get('set-cookie')?.split(';')[0]||cookie,header:res.headers.get('set-cookie')}}
const login=(username,remember=false,cookie='')=>call('login',{username,password,remember},cookie);
try{
 const owner=await login('private-owner',true);assert.match(owner.header,/Max-Age=2592000/);
 const ownerToken=owner.cookie.split('=')[1];let session=DB.sqlite.prepare('SELECT expires FROM sessions WHERE hash=?').get(sha(ownerToken));assert.ok(session.expires>Date.now()+29*86400000);
 const browser=await login('private-member');assert.doesNotMatch(browser.header,/Max-Age/);session=DB.sqlite.prepare('SELECT expires FROM sessions WHERE hash=?').get(sha(browser.cookie.split('=')[1]));assert.ok(session.expires>Date.now()+7.9*3600000&&session.expires<Date.now()+8.1*3600000);
 const second=await login('private-member',true);
 const pulse=(cookie,client,active,seq,status=200)=>call('presence',{client,active,seq},cookie,status);
 await pulse(browser.cookie,'browser_client',true,1);await pulse(second.cookie,'second_device',true,1);
 assert.equal((await call('members',null,owner.cookie)).body.members.find(x=>x.id==='private-member').online,true);
 await pulse(browser.cookie,'browser_client',false,3);assert.equal((await pulse(browser.cookie,'browser_client',true,2)).body.accepted,false);assert.ok((await onlineUsers(DB)).has('private-member'),'second device keeps the member online');
 await pulse(second.cookie,'second_device',false,2);assert.ok(!(await onlineUsers(DB)).has('private-member'));
 await pulse(second.cookie,'second_device',true,3);assert.ok(!(await onlineUsers(DB,Date.now()+91000)).has('private-member'),'timeout makes stale sessions offline');
 await pulse(second.cookie,'unsafe.client',true,4,400);await call('logout',{},second.cookie);assert.ok(!(await onlineUsers(DB)).has('private-member'));
 const rotated=await login('private-owner',false,owner.cookie);await call('state',null,owner.cookie,401);
 console.log('PASS remembered login duration, volatile session cookie, rotation, multi-device presence, monotonic sequence, expiry and logout.');

 await call('state',null,rotated.cookie);const secret={events:[{id:'private-event',name:'PRIVATE_UGC_EVENT',department:'办公室',date:'2026-10-08',createdBy:'private-member'}],tasks:[],templates:[{id:'private-template',name:'PRIVATE_UGC_TEMPLATE',steps:[],createdBy:'private-member'}],ledger:[{user:'private-member',points:8}],logs:[{text:'PRIVATE_UGC_LOG'}],notices:[{text:'PRIVATE_UGC_NOTICE',target:'all'}],cases:[{name:'PRIVATE_UGC_CASE'}]};
 DB.sqlite.prepare('INSERT OR REPLACE INTO workspace (id,version,data) VALUES (1,0,?)').run(JSON.stringify(secret));
 for(const id of ['private-owner','private-member']){DB.sqlite.prepare('INSERT INTO member_profiles (user,avatar,pending_name,review_status) VALUES (?,?,?,?)').run(id,'PRIVATE_UGC_AVATAR','PRIVATE_UGC_NAME','pending');DB.sqlite.prepare('INSERT INTO member_preferences (user,data) VALUES (?,?)').run(id,JSON.stringify({themeColor:'#123456',workspace:'办公室'}));DB.sqlite.prepare('INSERT INTO account_requests (user,reason,status,requested,revision) VALUES (?,?,?,?,1)').run(id,'PRIVATE_UGC_CLOSURE','pending',Date.now())}
 const statusBefore=DB.sqlite.prepare('SELECT id,status,password FROM users ORDER BY id').all();
 assert.deepEqual(await setAccountReview(DB,true),{reviewMode:true,available:1,sealed:3,changed:true});assert.equal((await setAccountReview(DB,true)).changed,false);
 assert.equal(DB.sqlite.prepare('SELECT data FROM workspace').get().data,JSON.stringify(secret),'business data remains byte-for-byte intact');
 await call('state',null,rotated.cookie,401);await call('state',null,browser.cookie,401);await call('login',{username:'private-member',password},'',401);await call('captcha',{username:'private-member'});const unknownChallenge=(await call('captcha',{username:'unused-review-account'})).body,ownerChallenge=(await call('captcha',{username:'private-owner'})).body;assert.deepEqual(Object.keys(unknownChallenge),Object.keys(ownerChallenge));assert.equal(unknownChallenge.required,ownerChallenge.required);await call('register',{username:'unused-review-account',name:'新用户',dept:'办公室',password},'',403);
 const review=await login('private-owner',true),info=(await call('info',null,review.cookie)).body;assert.equal(info.reviewMode,true);assert.equal(info.user.id,'review-admin');assert.equal(info.user.username,'review_admin');assert.equal(info.user.name,'审核管理员');assert.equal(info.user.avatar,'');
 for(const path of ['state','members','stats']){const data=(await call(path,null,review.cookie)).body;assert.doesNotMatch(JSON.stringify(data),/PRIVATE_UGC|private-owner|private-member|private-pending|private-disabled/);if(path==='state'){for(const key of ['events','tasks','ledger','logs','notices'])assert.deepEqual(data[key],[]);assert.equal(data.profile,null);assert.equal(data.accountRequest,null);assert.equal(data.settings.themeColor,'#e77b24');assert.equal(data.people.length,1);assert.ok(data.templates.every(t=>!t.createdBy))}if(path==='members'){assert.equal(data.members.length,1);assert.deepEqual(data.reviews,[]);assert.deepEqual(data.closures,[])}if(path==='stats')assert.deepEqual(data.events,[])}
 await call('profile/request',{name:'更名',avatar:''},review.cookie,403);await call('settings/save',{themeColor:'#abcdef'},review.cookie);assert.match(DB.sqlite.prepare('SELECT data FROM member_preferences WHERE user=?').get('private-owner').data,/#123456/);
 const newEvent=(await call('events/create',{name:'审核空白演示',date:'2026-10-09',template:'blank'},review.cookie)).body.id;assert.ok(newEvent);assert.equal(JSON.parse(DB.sqlite.prepare('SELECT data FROM workspace').get().data).events.length,1);assert.equal((await call('state',null,review.cookie)).body.events[0].createdBy,'review-admin');
 const mini=createMiniGateway({worker,DB});const res=await mini(new Request(origin+'/mini/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'state',token:review.cookie.split('=')[1]})}),env);const body=await res.json();assert.equal(body.status,200);assert.equal(body.body.user.name,'审核管理员');assert.doesNotMatch(JSON.stringify(body),/PRIVATE_UGC|private-owner|private-member/);
 const miniOld=await mini(new Request(origin+'/mini/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'state',token:browser.cookie.split('=')[1]})}),env);assert.equal((await miniOld.json()).status,401);
 console.log('PASS full review isolation: account sessions, profiles, settings, requests, templates, schedules, points, notices, logs and mini gateway; owner identity masked.');
 for(let attempt=0;attempt<61;attempt++){const response=await worker.fetch(new Request(origin+'/api/captcha',{method:'POST',headers:{Origin:origin,'X-FR-Request':'1','Content-Type':'application/json'},body:JSON.stringify({username:'unknown-'+attempt})}),{...env,TELEMETRY_CONTEXT:{ip:'198.51.100.250'}});assert.equal(response.status,attempt===60?429:200,'Unknown-account challenges must obey the same peer limit')}
 console.log('PASS review challenge responses do not disclose account existence and unknown names cannot bypass CAPTCHA rate limiting.');
 await setAccountReview(DB,false);assert.deepEqual(DB.sqlite.prepare('SELECT id,status,password FROM users ORDER BY id').all(),statusBefore);assert.equal(DB.sqlite.prepare('SELECT data FROM workspace').get().data,JSON.stringify(secret));const restored=await login('private-owner');assert.equal((await call('state',null,restored.cookie)).body.events[0].name,'PRIVATE_UGC_EVENT');assert.equal((await call('state',null,restored.cookie)).body.settings.themeColor,'#123456');assert.equal((await call('members',null,restored.cookie)).body.members.length,4);await call('state',null,review.cookie,401);
 console.log('PASS restore keeps original statuses, password hashes and original business/profile/preferences records without merging review edits.');
}finally{DB.sqlite.close()}
