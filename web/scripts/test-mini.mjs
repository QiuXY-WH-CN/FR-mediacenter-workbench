import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import worker from '../dist/server/index.js';
import {database} from './local-db.mjs';
import {createMiniGateway} from './mini-gateway.mjs';

const DB = database();
for(const f of (await readdir('drizzle')).filter(x=>x.endsWith('.sql'))) DB.sqlite.exec(await readFile('drizzle/'+f,'utf8'));
const env = {DB, BOOTSTRAP_HASH: createHash('sha256').update('test-initialization-token').digest('hex')};
const bridge = {appid:'wx329dab0b8d30dec7', bridgeSecret:'test-bridge-secret-0123456789-0123456789'};
const mini = createMiniGateway({worker, DB, bridgeConfig: bridge});

const origin = 'https://local.test';
let ip = 0;
async function web(path,data,cookie='',expected=200,overrides={}){
  const headers={'Origin':origin,'CF-Connecting-IP':'127.0.0.'+(++ip),'X-FR-Request':'1',...overrides};
  if(cookie) headers.Cookie=cookie;
  if(data) headers['Content-Type']='application/json';
  const r=await worker.fetch(new Request(origin+'/api/'+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined}),env);
  const b=await r.json();
  assert.equal(r.status,expected,`web ${path}: ${JSON.stringify(b)}`);
  return {body:b,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};
}

async function miniCall(path,data={},token='',expected=200,extra={}){
  const payload={path,data,token};
  const r=await mini(new Request('http://mini.local/mini/api',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(payload)}),env);
  const b=await r.json();
  assert.equal(b.status,expected,`mini ${path}: ${JSON.stringify(b)}`);
  return b;
}

async function cloudCall(path,data={},token='',identity={appid:bridge.appid,openid:'openid-owner'},expected=200){
  const payload={path,data,token,_identity:identity};
  const body=JSON.stringify(payload);
  const stamp=String(Date.now());
  const nonce=randomBytes(16).toString('hex');
  const signature=createHmac('sha256',bridge.bridgeSecret).update(`${stamp}\n${nonce}\n${body}`).digest('hex');
  const r=await mini(new Request('http://mini.local/mini/api',{method:'POST',headers:{
    'Content-Type':'application/json',
    'X-FR-Cloud-Time':stamp,
    'X-FR-Cloud-Nonce':nonce,
    'X-FR-Cloud-Signature':signature
  },body}),env);
  const b=await r.json();
  assert.equal(b.status,expected,`cloud ${path}: ${JSON.stringify(b)}`);
  return b;
}

const password='Test-password-47-strong';

// Initial setup through the web API, then use the mini API for the same account.
const owner=await web('setup',{token:'test-initialization-token',username:'owner',name:'负责人',dept:'办公室',password});
let miniLogin=await miniCall('login',{username:'owner',password});
assert.ok(miniLogin.sessionToken,'mini login must issue a session token');
let miniToken=miniLogin.sessionToken;
let state=await miniCall('state',{},miniToken);
assert.equal(state.body.user.username,'owner');
assert.equal(state.body.user.role,'admin');

// Mini logout destroys only the mini session, not the web cookie session.
await miniCall('logout',{},miniToken);
await miniCall('state',{},miniToken,401);
await web('state',null,owner.cookie);

// Multi-device sync: web creates an event, mini sees it; mini creates an event, web sees it.
miniLogin=await miniCall('login',{username:'owner',password});
miniToken=miniLogin.sessionToken;
const event=(await web('events/create',{name:'双端同步活动',date:'2026-10-10',allDay:true},owner.cookie)).body.id;
state=await miniCall('state',{},miniToken);
assert.ok(state.body.events.some(e=>e.id===event),'mini should see web-created event');
await miniCall('events/create',{name:'小程序创建活动',date:'2026-10-11',allDay:true},miniToken);
state=(await web('state',null,owner.cookie)).body;
assert.ok(state.events.some(e=>e.name==='小程序创建活动'),'web should see mini-created event');

// Cloud WeChat binding, status, login and rebinding/unbind.
await cloudCall('wechat/login',{},'',{appid:bridge.appid,openid:'openid-owner'},403);
await cloudCall('wechat/bind',{},miniToken);
const status=await cloudCall('wechat/status',{},miniToken);
assert.equal(status.body.bound,true);
const cloudLogin=await cloudCall('wechat/login');
assert.ok(cloudLogin.sessionToken,'bound cloud login should issue a session token');

// A member may replace their own binding; a direct request cannot forge an identity.
await cloudCall('wechat/bind',{},miniToken,{appid:bridge.appid,openid:'openid-other'});
await cloudCall('wechat/login',{},'',{appid:bridge.appid,openid:'openid-owner'},403);
await cloudCall('wechat/login',{},'',{appid:bridge.appid,openid:'openid-other'});
await miniCall('wechat/bind',{},miniToken,403);

// Health and SOP endpoints.
const health=await miniCall('health');
assert.equal(health.body.ok,true);
await miniCall('sop',{},'',401);
const sopLogin=await miniCall('login',{username:'owner',password});
const docs=await miniCall('sop',{},sopLogin.sessionToken);
assert.ok(Array.isArray(docs.body)&&docs.body.length>0,'sop should return documents');

console.log('PASS: mini gateway sessions, logout, cross-device sync, cloud WeChat identity, health and SOP.');
DB.sqlite.close();



