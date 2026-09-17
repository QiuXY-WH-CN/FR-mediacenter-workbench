import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import worker from '../../新版工作台/dist/server/index.js';
import {database} from '../../新版工作台/scripts/local-db.mjs';
import {createMiniGateway} from '../../新版工作台/scripts/mini-gateway.mjs';
const require=createRequire(import.meta.url),DB=database(),origin='http://127.0.0.1:8766';
const migrations=new URL('../../新版工作台/drizzle/',import.meta.url);
for(const f of (await readdir(migrations)).filter(x=>x.endsWith('.sql')))DB.sqlite.exec(await readFile(new URL(f,migrations),'utf8'));
const env={DB,BOOTSTRAP_HASH:createHash('sha256').update('native-test').digest('hex')};
const gateway=createMiniGateway(worker,env,{origin,appid:'wx329dab0b8d30dec7'});
await worker.fetch(new Request(origin+'/api/setup',{method:'POST',headers:{Origin:origin,'X-FR-Request':'1','Content-Type':'application/json'},body:JSON.stringify({token:'native-test',username:'owner',password:'Native-test-2026',name:'本机负责人',dept:'办公室'})}),env);
const storage=new Map(),errors=[],routes=[];
global.wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:opts=>{gateway(new Request(opts.url,{method:opts.method,headers:opts.header,body:JSON.stringify(opts.data)}),'native-test').then(async r=>opts.success({statusCode:r.status,data:await r.json()})).catch(opts.fail)},showModal:opts=>{if(opts.title==='暂未完成')errors.push(opts.content)},showToast:()=>{},switchTab:o=>routes.push(o.url),reLaunch:o=>routes.push(o.url),navigateTo:o=>routes.push(o.url),navigateBack:()=>routes.push('back'),stopPullDownRefresh:()=>{},setClipboardData:o=>o.success?.()};
const V=require('../miniprogram/utils/view.js');
await V.api.call('login',{username:'owner',password:'Native-test-2026'});await V.api.refresh();
let definition;global.Page=p=>definition=p;
function instance(name,options={}){const file='../miniprogram/pages/'+name+'/index.js';delete require.cache[require.resolve(file)];require(file);const page={...definition,data:structuredClone(definition.data||{}),route:'pages/'+name+'/index',setData(patch){for(const [key,value] of Object.entries(patch)){const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.');let node=this.data;for(const p of parts.slice(0,-1))node=node[p]??(node[p]={});node[parts.at(-1)]=value}}};page.onLoad?.(options);return page;}
const edit=instance('editor',{mode:'event-new'});await edit.onShow();
function set(page,key,value){const index=page.data.fields.findIndex(f=>f.key===key);assert.ok(index>=0,key);page.change({currentTarget:{dataset:{index}},detail:{value}})}
assert.equal(edit.values().template,'blank');set(edit,'name','原生页面创建');set(edit,'date','2026-09-22');set(edit,'rewardPoints','15');await edit.save();assert.deepEqual(errors,[]);
let state=V.api.getState(),event=state.events.find(e=>e.name==='原生页面创建');assert.ok(event);assert.equal(state.tasks.length,0);
const taskEditor=instance('editor',{mode:'task-new',event:event.id});await taskEditor.onShow();set(taskEditor,'name','手机端摄影交付');set(taskEditor,'requirements','精选照片与署名');await taskEditor.save();assert.deepEqual(errors,[]);
const task=instance('task',{id:V.api.getState().tasks[0].id});await task.onShow();assert.equal(task.data.canAccept,true);await task.doAction({currentTarget:{dataset:{action:'accept'}}});task.startSubmit();task.input({currentTarget:{dataset:{key:'submission'}},detail:{value:'已提交精选照片'}});task.checks({detail:{value:['0','1']}});await task.send();assert.equal(task.data.task.status,'review');await task.doAction({currentTarget:{dataset:{action:'approve'}}});assert.equal(V.api.getState().ledger[0].points,15);
const template=instance('editor',{mode:'template-from',event:event.id});await template.onShow();await template.save();assert.equal(V.api.getState().templates.filter(t=>t.createdBy).length,1);
const calendar=instance('calendar');await calendar.onShow();calendar.setData({year:2026,month:9,selected:'2026-09-22'});calendar.calendar();assert.ok(calendar.data.selectedEvents.some(x=>x.id===event.id));
const snap=structuredClone(V.api.getState());snap.events[0].name='跨端修改标题';taskEditor.setData({'fields[0].value':'尚未保存的草稿'});taskEditor.renderState(V.decorate(snap));assert.equal(taskEditor.data.fields[0].value,'尚未保存的草稿');
assert.deepEqual(errors,[]);
// Render actual WeChat-compiled WXML to inspect template bindings and navigation URLs.
const context={window:{},console,__WXML_GLOBAL__:{},__vd_version_info__:{},__wxAppData:{}};vm.createContext(context);vm.runInContext(await readFile(new URL('../.qa/wxml.js',import.meta.url),'utf8'),context);
const render=context.$gwx('miniprogram/pages/events/index.wxml');assert.equal(typeof render,'function');const tree=render({events:V.decorate(V.api.getState()).events,manager:true});assert.ok(JSON.stringify(tree).includes('原生页面创建'));
const eventRender=context.$gwx('miniprogram/pages/event/index.wxml');const eventTree=eventRender({event:V.decorate(V.api.getState()).events[0],tasks:[]});assert.ok(JSON.stringify(eventTree).includes('mode=task-new&event='),'WXML entities must produce valid query strings');
for(const p of [edit,taskEditor,task,template,calendar])p.onUnload?.();
await writeFile(new URL('../.qa/native-result.json',import.meta.url),JSON.stringify({passed:true,checks:['native editor blank event','task creation','accept-submit-approve','points','save event as template','calendar shared data','preserve form draft','actual WXML render and URL binding']},null,2));
console.log('PASS: native page controllers, API integration and compiled WXML rendering.');
