import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import worker from '../src/worker.js';
import {database} from './local-db.mjs';
import {setAccountReview} from './account-review.mjs';
import {createMiniGateway} from './mini-gateway.mjs';
import {reviewPublicData} from '../src/review-mode.js';

// Deliberately collide names with enums; masking may touch only identity fields.
for(const username of ['admin','active','light','en']){
 const owner={id:'fixture-account-id',username,name:'办公室'};
 const result=reviewPublicData({user:{...owner,role:'admin',status:'active',owner:true},settings:{appearance:'light',language:'en',workspace:'办公室'},departments:['办公室'],people:[{...owner,role:'admin'}],events:[{id:'event-id',name:'办公室',createdBy:owner.id}],tasks:[{owners:[owner.id],receivers:[owner.id],submittedBy:owner.id}],notices:[{target:[owner.id]}]},owner);
 assert.equal(result.user.id,'review-admin');assert.equal(result.user.username,'review_admin');assert.equal(result.user.name,'审核管理员');assert.equal(result.user.role,'admin');assert.equal(result.user.status,'active');assert.equal(result.user.owner,true);
 assert.deepEqual(result.settings,{appearance:'light',language:'en',workspace:'办公室'});assert.deepEqual(result.departments,['办公室']);assert.equal(result.events[0].name,'办公室');assert.equal(result.events[0].createdBy,'review-admin');assert.deepEqual(result.tasks[0].owners,['review-admin']);assert.equal(result.tasks[0].submittedBy,'review-admin');assert.deepEqual(result.notices[0].target,['review-admin']);
}

const DB=database(),password='Synthetic-review-login-password-47';
for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())DB.sqlite.exec(await readFile('drizzle/'+file,'utf8'));
DB.sqlite.prepare('INSERT INTO users(id,username,name,dept,role,status,password,owner,created) VALUES(?,?,?,?,?,?,?,?,?)').run('fixture-account-id','admin','办公室','办公室','admin','active',await bcrypt.hash(password,4),1,Date.now());
await setAccountReview(DB,true);
const gateway=createMiniGateway({worker,DB}),cache=new Map(),schemaErrors=[];
const config={transport:'direct',directBaseUrl:'https://native-login.test'};
const recovery={normalizeConnection:()=>config,safeRead:(key,fallback)=>cache.has(key)?cache.get(key):fallback,safeWrite:(key,val)=>{cache.set(key,val);return true},safeRemove:key=>{cache.delete(key);return true},applySettings:s=>s,saveDisplay(){},capture:(_,code)=>schemaErrors.push(code)};
const wx={request(options){gateway(new Request(options.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options.data)}),{DB,DISABLE_TELEMETRY:true}).then(async r=>options.success({statusCode:r.status,data:await r.json()})).catch(options.fail)}};
const context={module:{exports:{}},require:path=>path.includes('login-memory')?{forgetPassword(){}}:path.includes('recovery')?recovery:config,wx,setTimeout,clearTimeout};
vm.runInNewContext(await readFile('../miniprogram/services/api.js','utf8'),context);const api=context.module.exports;
try{
 const info=await api.info();assert.equal(info.reviewMode,true);assert.equal(info.user,null);
 await api.call('login',{username:'admin',password,remember:false});assert.ok(api.token());assert.equal(cache.has('fr.token'),false);
 const state=await api.refresh(true);assert.ok(state,'Real native state validator must accept review admin login');assert.equal(state.user.role,'admin');assert.equal(state.user.name,'审核管理员');assert.equal(state.user.id,'review-admin');assert.equal(state.people.length,1);assert.equal(state.people[0].role,'admin');assert.equal(state.events.length,0);assert.equal(state.tasks.length,0);assert.equal(api.isReadOnly(),false);assert.equal(schemaErrors.length,0);assert.equal(api.getState().user.role,'admin');assert.equal(JSON.stringify(state).includes('fixture-account-id'),false);
 console.log('PASS native review login: real bcrypt authentication → mini gateway → native session and strict state validation; username/role collision fixed, identity anonymous and original enums unchanged.');
}finally{DB.sqlite.close()}
