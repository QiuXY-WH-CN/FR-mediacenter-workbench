import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import bcrypt from 'bcryptjs';
import worker from '../src/worker.js';
import {database} from './local-db.mjs';

const migrations=await Promise.all((await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort().map(f=>readFile('drizzle/'+f,'utf8')));
const origin='https://task-race.test',dept='视觉传达部',otherDept='新媒体运营部',password='Race-test-password-strong-47',hash=await bcrypt.hash(password,4);
let cases=0;

// Keep the real SQLite statements and atomic batch implementation; delay only the
// delivery of a completed read or the start of a write to reproduce await interleaving.
function instrument(base){
 const hooks={};
 const wrap=statement=>({
  underlying:statement,sql:statement.sql,params:statement.params,
  bind(...params){return wrap(statement.bind(...params))},
  async first(){const value=await statement.first();await hooks.afterRead?.({sql:statement.sql,params:statement.params,kind:'first',value});return value},
  async all(){const value=await statement.all();await hooks.afterRead?.({sql:statement.sql,params:statement.params,kind:'all',value});return value},
  async run(){await hooks.beforeRun?.({sql:statement.sql,params:statement.params});return statement.run()}
 });
 return {hooks,sqlite:base.sqlite,prepare:sql=>wrap(base.prepare(sql)),async batch(statements){await hooks.beforeBatch?.(statements);return base.batch(statements.map(s=>s.underlying))}};
}
async function fixture(){
 const DB=instrument(database());for(const sql of migrations)DB.sqlite.exec(sql);
 const cookies={};
 for(const [id,role,owner] of [['root','admin',1],['admin','admin',null],['lead','manager',null],['a','member',null],['b','member',null]]){
  DB.sqlite.prepare('INSERT INTO users (id,username,name,dept,role,status,password,owner,created) VALUES (?,?,?,?,?,?,?,?,?)').run(id,id.length<3?'member-'+id:id,'测试'+id,dept,role,'active',hash,owner,Date.now());
  const token=createHash('sha256').update('race-session-'+id).digest('hex');DB.sqlite.prepare('INSERT INTO sessions (hash,user,expires) VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+600000);cookies[id]='fr_session_v2='+token;
 }
 const env={DB};let ip=0;
 async function call(path,data,user='root',status=200){
  const response=await worker.fetch(new Request(origin+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,'X-FR-Request':'1','Content-Type':'application/json',Cookie:cookies[user],'CF-Connecting-IP':'198.51.100.'+(++ip)},body:data?JSON.stringify(data):undefined}),env);
  const body=await response.json();assert.equal(response.status,status,path+' '+user+': '+JSON.stringify(body));return body;
 }
 const event=(await call('events/create',{name:'竞态回归活动',date:'2026-10-07',template:'blank'})).id;
 const template=(await call('templates/save',{name:'竞态回归模板',steps:[{name:'模板任务',dept,offset:0,time:'18:00',requirements:'模板成果'}]})).id;
 DB.sqlite.prepare('INSERT INTO member_profiles (user,avatar) VALUES (?,?)').run('b','retained-test-avatar');DB.sqlite.prepare('INSERT INTO member_preferences (user,data) VALUES (?,?)').run('b',JSON.stringify({themeColor:'#168875'}));
 const task=fields=>call('tasks/create',{event,name:'竞态任务',owners:['a'],receivers:['root'],due:'2026-10-07T18:00',requirements:'成果说明',...fields});
 const closure=()=>call('account/request',{password,reason:'完成交接后注销'},'b');
 const review=(status=200,user='root',revision=1)=>call('account/review',{id:'b',revision,action:'approve'},user,status);
 const update=(fields={},id='b',user='root',status=200)=>call('members/update',{id,role:'member',dept,status:'active',...fields},user,status);
 const workspace=()=>JSON.parse(DB.sqlite.prepare('SELECT data FROM workspace WHERE id=1').get().data);
 const version=()=>DB.sqlite.prepare('SELECT version FROM workspace WHERE id=1').get().version;
 const member=()=>DB.sqlite.prepare('SELECT * FROM users WHERE id=?').get('b');
 const request=()=>DB.sqlite.prepare('SELECT * FROM account_requests WHERE user=?').get('b');
 const retained=()=>{assert.equal(member().status,'active');assert.equal(member().username,'member-b');assert.ok(DB.sqlite.prepare('SELECT 1 FROM sessions WHERE user=?').get('b'),'failed approval must retain the session');assert.ok(DB.sqlite.prepare('SELECT 1 FROM member_profiles WHERE user=?').get('b'),'failed approval must retain the profile');assert.ok(DB.sqlite.prepare('SELECT 1 FROM member_preferences WHERE user=?').get('b'),'failed approval must retain preferences')};
 const closed=()=>{assert.equal(member().status,'disabled');assert.equal(member().username,'closed-b');assert.equal(request().status,'approved');for(const table of ['sessions','member_profiles','member_preferences'])assert.equal(DB.sqlite.prepare('SELECT 1 FROM '+table+' WHERE user=?').get('b'),undefined);assert.ok(!workspace().tasks.some(t=>t.status!=='done'&&[...(t.owners||[t.owner]),...(t.receivers||[t.receiver])].includes('b')),'closure cannot leave a newly assigned open task')};
 return {DB,call,event,template,task,closure,review,update,workspace,version,member,request,retained,closed};
}
function once(f,hook,match,action){f.DB.hooks[hook]=async value=>{if(!match(value))return;delete f.DB.hooks[hook];await action(value)}}
const peopleRead=q=>q.kind==='all'&&/^SELECT id,name,dept,role,status,owner FROM users/.test(q.sql);
const workspaceRead=q=>q.kind==='first'&&/^SELECT (?:version,)?data FROM workspace WHERE id=1$/.test(q.sql);
const approvalBatch=statements=>statements.some(s=>/^UPDATE account_requests SET status=\?/.test(s.sql));
async function operation(f,kind,receiver=false){
 const parties=receiver?{owners:['a'],receivers:['b']}:{owners:['b'],receivers:['root']};
 if(kind==='create')return status=>f.call('tasks/create',{event:f.event,name:'交错创建',due:'2026-10-07T18:00',requirements:'成果',...parties},'root',status);
 if(kind==='template')return status=>f.call('events/create',{name:'交错模板派单',date:'2026-10-07',template:f.template,assignments:[parties]},'root',status);
 const task=await f.task({owners:kind==='reassign'?['lead']:['a']});
 return status=>f.call('tasks/action',{id:task.id,action:kind,...parties},kind==='reassign'?'lead':'root',status);
}
async function run(name,fn){const f=await fixture();try{await fn(f);cases++;console.log('PASS '+name)}finally{f.DB.sqlite.close()}}

for(const kind of ['create','edit','assign','reassign','template']){
 await run(kind+': closure wins before the people snapshot is delivered',async f=>{
  const mutate=await operation(f,kind);await f.closure();let fired=false;
  once(f,'afterRead',peopleRead,async()=>{fired=true;await f.review()});
  await mutate(kind==='reassign'?403:400);assert.ok(fired);f.closed();
 });
 await run(kind+': assignment wins before the closure workspace snapshot is delivered',async f=>{
  const mutate=await operation(f,kind);await f.closure();let fired=false;
  once(f,'afterRead',workspaceRead,async()=>{fired=true;await mutate(200)});
  await f.review(409);assert.ok(fired);f.retained();assert.equal(f.request().status,'pending');assert.ok(f.workspace().tasks.some(t=>t.owners.includes('b')));
 });
}
for(const kind of ['create','edit','template']){
 await run(kind+': a new co-reviewer also blocks closure',async f=>{
  const mutate=await operation(f,kind,true);await f.closure();once(f,'afterRead',workspaceRead,()=>mutate(200));await f.review(409);f.retained();assert.ok(f.workspace().tasks.some(t=>t.receivers.includes('b')));
 });
}
for(const kind of ['create','edit','reassign','template']){
 await run(kind+': disabling a candidate invalidates the cached people list',async f=>{
  const mutate=await operation(f,kind),before=f.version();once(f,'afterRead',peopleRead,()=>f.update({status:'disabled'}));await mutate(kind==='reassign'?403:400);assert.equal(f.member().status,'disabled');assert.equal(f.version(),before+1);assert.ok(!f.workspace().tasks.some(t=>t.owners.includes('b')));
 });
}
await run('department change rejects a stale internal-task assignment',async f=>{
 const event=(await f.call('events/create',{name:'部门内部活动',date:'2026-10-07',department:dept})).id;
 once(f,'afterRead',peopleRead,()=>f.update({dept:otherDept}));await f.call('tasks/create',{event,name:'部门内派单',owners:['b'],receivers:['root'],due:'2026-10-07T18:00',requirements:'成果'},'root',400);assert.equal(f.member().dept,otherDept);assert.ok(!f.workspace().tasks.some(t=>t.owners.includes('b')));
});
await run('promotion rejects a stale ordinary-member transfer',async f=>{
 const mutate=await operation(f,'reassign');once(f,'afterRead',peopleRead,()=>f.update({role:'manager'}));await mutate(403);assert.equal(f.member().role,'manager');
});
await run('promotion revokes delegated archive based on a stale team role',async f=>{
 const t=await f.task({owners:['b']});once(f,'afterRead',peopleRead,()=>f.update({role:'manager'}));await f.call('tasks/action',{id:t.id,action:'archive',submission:'代交成果',checked:[true,true]},'lead',403);assert.equal(f.workspace().tasks.find(x=>x.id===t.id).status,'pending');assert.equal(f.workspace().ledger.length,0);
});
await run('actor demotion is rechecked when a shared mutation retries',async f=>{
 once(f,'afterRead',peopleRead,()=>f.update({},'admin'));await f.call('tasks/create',{event:f.event,name:'降权后不能派单',owners:['a'],receivers:['root'],due:'2026-10-07T18:00',requirements:'成果'},'admin',403);assert.equal(f.workspace().tasks.length,0);
});
await run('actor demotion revokes template creation during a retry',async f=>{
 once(f,'afterRead',peopleRead,()=>f.update({},'lead'));await f.call('events/create',{name:'降权后不能建活动',date:'2026-10-07',template:f.template,assignments:[{owners:['a'],receivers:['root']}]},'lead',403);assert.equal(f.workspace().events.length,1);
});
await run('actor disablement is rechecked despite the original session snapshot',async f=>{
 const mutate=await operation(f,'reassign');once(f,'afterRead',peopleRead,()=>f.update({status:'disabled'},'lead'));await mutate(403);assert.ok(!f.workspace().tasks.some(t=>t.owners.includes('b')));
});
await run('a demoted reviewer cannot commit closure or erase member data',async f=>{
 await f.closure();once(f,'beforeBatch',approvalBatch,()=>f.update({},'admin'));await f.review(403,'admin');f.retained();assert.equal(f.request().status,'pending');
});
await run('a demoted manager cannot finish a member update started earlier',async f=>{
 once(f,'afterRead',q=>q.kind==='first'&&q.sql==='SELECT * FROM users WHERE id=?'&&q.params[0]==='b',()=>f.update({},'lead'));await f.update({status:'disabled'},'b','lead',403);f.retained();
});
await run('member updates cannot reactivate an account closed after their snapshot',async f=>{
 await f.closure();once(f,'beforeBatch',statements=>statements.some(s=>/^UPDATE users SET role=/.test(s.sql)),()=>f.review());await f.update({},'b','root',403);f.closed();
});
await run('replaced request revision preserves all member data',async f=>{
 await f.closure();once(f,'beforeBatch',approvalBatch,()=>f.closure());await f.review(409);f.retained();assert.equal(f.request().status,'pending');assert.equal(f.request().revision,2);
});
await run('cancelled request preserves all member data',async f=>{
 await f.closure();once(f,'beforeBatch',approvalBatch,()=>f.call('account/cancel',{},'b'));await f.review(409);f.retained();assert.equal(f.request().status,'cancelled');
});
await run('a delayed preference save cannot recreate data deleted by closure',async f=>{
 await f.closure();once(f,'afterRead',q=>q.kind==='first'&&q.sql==='SELECT data FROM member_preferences WHERE user=?'&&q.params[0]==='b',()=>f.review());await f.call('settings/save',{themeColor:'#123456'},'b',403);f.closed();
});
await run('a delayed closure request cannot replace an approved request',async f=>{
 await f.closure();once(f,'beforeRun',q=>/^INSERT INTO account_requests/.test(q.sql),()=>f.review());
 await f.call('account/request',{password,reason:'迟到的重复申请'},'b',403);f.closed();assert.equal(f.request().revision,1);
});
await run('a delayed profile request cannot recreate data deleted by closure',async f=>{
 await f.closure();once(f,'afterRead',q=>q.kind==='first'&&q.sql==='SELECT * FROM member_profiles WHERE user=?'&&q.params[0]==='b',()=>f.review());await f.call('profile/request',{name:'迟到的修改姓名',avatar:''},'b',403);f.closed();
});
await run('three consecutive workspace conflicts leave no partial closure',async f=>{
 await f.closure();const before=f.version();let conflicts=0;
 f.DB.hooks.beforeBatch=async statements=>{if(approvalBatch(statements)){conflicts++;await f.call('events/update',{id:f.event,name:'并发活动编辑'+conflicts})}};
 await f.review(409);assert.equal(conflicts,3);assert.equal(f.version(),before+3);f.retained();assert.equal(f.request().status,'pending');
});
await run('transaction rollback restores reservation, account and deleted data',async f=>{
 await f.closure();const before=f.version();f.DB.sqlite.exec("CREATE TRIGGER fail_profile_delete BEFORE DELETE ON member_profiles BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
 const original=console.error;console.error=()=>{};try{await f.review(500)}finally{console.error=original}
 f.retained();assert.equal(f.request().status,'pending');assert.equal(f.version(),before);f.DB.sqlite.exec('DROP TRIGGER fail_profile_delete');await f.review();f.closed();
});
console.log('PASS '+cases+' task/account races: real await interleaving, every assignment path, owner/reviewer handover, membership/actor permissions, revision changes, retry exhaustion and atomic rollback.');
