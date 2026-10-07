import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const plain=new Map(),secure=new Map(),requests=[];
let capable=true,pendingWrite=null;
const wx={canIUse:key=>capable&&['setStorage.object.encrypt','getStorage.object.encrypt'].includes(key),getStorageSync:key=>plain.get(key),setStorageSync:(key,data)=>plain.set(key,structuredClone(data)),removeStorageSync:key=>{plain.delete(key);secure.delete(key)},setStorage:o=>{assert.equal(o.encrypt,true);requests.push({method:'set',encrypt:o.encrypt});const write=()=>{secure.set(o.key,structuredClone(o.data));o.success({})};pendingWrite===false?(pendingWrite=write):write()},getStorage:o=>{assert.equal(o.encrypt,true);requests.push({method:'get',encrypt:o.encrypt});o.success({data:secure.get(o.key)})}};
const context={wx,module:{exports:{}},Date,Math,Promise,setTimeout,clearTimeout};
vm.runInNewContext(await readFile('../miniprogram/utils/login-memory.js','utf8'),context);
const memory=context.module.exports,config={transport:'direct',directBaseUrl:'https://example.test'},password='Synthetic-secret-password-27';
assert.equal(memory.supported(),true);
assert.equal(await memory.success(config,'remember_user',password,true),true);
let restored=await memory.load(config);assert.equal(restored.password,password);assert.equal(restored.username,'remember_user');assert.equal(restored.remember,true);
assert.ok(!JSON.stringify([...plain]).includes(password),'Ordinary native cache never contains the password.');
assert.ok(requests.every(x=>x.encrypt),'Every secret read/write uses platform encryption.');
assert.equal((await memory.load({...config,directBaseUrl:'https://other.test'})).username,'','Credentials never cross connection origins.');
memory.switchAccount();restored=await memory.load(config);assert.equal(restored.username,'');assert.equal(restored.password,'');assert.equal(restored.remember,false);
restored=await memory.load(config);assert.equal(restored.username,'remember_user','Explicit sign-out preserves the remembered account.');
memory.forgetPassword();restored=await memory.load(config);assert.equal(restored.username,'remember_user');assert.equal(restored.password,'');
await memory.success(config,'remember_user',password,false);assert.equal(plain.size,0);assert.equal(secure.size,0);
capable=false;const count=requests.length;assert.equal(await memory.success(config,'limited_device',password,true),false);assert.equal(requests.length,count,'Unsupported platforms never fall back to plaintext credential storage.');restored=await memory.load(config);assert.equal(restored.username,'limited_device');assert.equal(restored.password,'');assert.equal(restored.secure,false);assert.ok(!JSON.stringify([...plain]).includes(password));
capable=true;pendingWrite=false;const writing=memory.success(config,'stale_login',password,true);memory.forget();pendingWrite();assert.equal(await writing,false);assert.equal((await memory.load(config)).password,'','Late encrypted writes cannot resurrect cancelled remembered credentials.');
await memory.success(config,'remember_user',password,true);secure.get('fr.loginCredential').record='incorrect-record';assert.equal((await memory.load(config)).password,'','Only the exact consented record may be read.');memory.forget();

// Test session persistence and presence using the real API module with isolated transport.
const cache=new Map([['fr.token','old-persistent-token']]);let response,transport='ok',forgot=0;
const recovery={normalizeConnection:(x,d)=>({...d,...x}),safeRead:(k,d)=>cache.get(k)??d,safeWrite:(k,v)=>{cache.set(k,v);return true},safeRemove:k=>{cache.delete(k);return true},applySettings:x=>x||{},saveDisplay(){},capture(){}};
const defaults={transport:'direct',directBaseUrl:'https://example.test',pollMs:30000};
const nativeWx={request:o=>transport==='fail'?o.fail({}):o.success({statusCode:200,data:response})};
const apiContext={wx:nativeWx,module:{exports:{}},require:p=>p.includes('config')?defaults:p.includes('login-memory')?{forgetPassword(){forgot++}}:recovery,Set,Object,Number,Error,Promise,setTimeout,clearTimeout};
vm.runInNewContext(await readFile('../miniprogram/services/api.js','utf8'),apiContext);const api=apiContext.module.exports;
response={status:200,sessionToken:'session-only-token',body:{ok:true}};await api.call('login',{username:'first_user',password,remember:false});assert.equal(api.token(),'session-only-token');assert.equal(cache.has('fr.token'),false,'Session-only sign-in deletes any older persisted token.');
response={status:200,sessionToken:'remembered-token',body:{ok:true}};await api.call('login',{username:'first_user',password,remember:true});assert.equal(cache.get('fr.token'),'remembered-token');
response={status:200,body:{user:{id:'one',role:'member'},people:[],events:[],tasks:[],settings:{}}};await api.refresh(true);transport='fail';await assert.rejects(()=>api.call('presence',{online:true}));assert.equal(api.isReadOnly(),false,'Presence transport failures never turn task data read-only.');
await assert.rejects(()=>api.call('tasks/action',{id:'test',action:'accept'}));assert.equal(api.isReadOnly(),true);
transport='ok';response={status:200,body:{ok:true}};await api.call('presence',{online:false});assert.equal(api.isReadOnly(),true,'Presence remains available while a workspace snapshot is read-only.');
await api.call('logout',{});assert.equal(api.token(),'');assert.equal(cache.has('fr.token'),false);
response={status:200,body:{ok:true}};await api.call('recover',{token:'synthetic-reset',password});assert.equal(forgot,1);
response={status:200,body:{reviewMode:true,user:null}};await api.call('info');response={status:200,body:{ok:true}};await api.call('recover',{token:'synthetic-reset',password});assert.equal(forgot,1,'Review-mode security actions preserve the sealed local vault.');

let authPage,review=true,loads=0,saves=0,forgets=0,active=false,navigated=0;
const authMemory={supported:()=>true,realm:memory.realm,load:async()=>{loads++;return {remember:true,username:'historical_user',password,secure:true}},success:async()=>{saves++;return true},forget(){forgets++},forgetPassword(){forgets++}};
const authApi={config:()=>config,token:()=>'',refresh:async()=>({}),call:async path=>path==='info'?{reviewMode:review,initialized:true,user:active?{username:review?'review_admin':'historical_user',status:'active',owner:true}:null}:{ok:true}};
vm.runInNewContext(await readFile('../miniprogram/pages/auth/index.js','utf8'),{Page:p=>authPage=p,require:p=>p.includes('sharing')?{page:x=>x}:p.includes('interface')?{install(){}}:p.includes('login-memory')?authMemory:{api:authApi,depts:['办公室']},wx:{switchTab(){navigated++},stopPullDownRefresh(){}},getApp:()=>({}),Date,Error,Object,Number,Math,setInterval,clearInterval});authPage.data=structuredClone(authPage.data);authPage.setData=function(next){Object.assign(this.data,next)};authPage._memoryEpoch=0;authPage._securityEpoch=0;
await authPage.bootstrap();await Promise.resolve();assert.equal(authPage.data.reviewMode,true);assert.equal(authPage.data.username,'');assert.equal(authPage.data.password,'');assert.equal(loads,0,'Review mode does not even read a historical credential vault.');authPage.switchMode({currentTarget:{dataset:{mode:'register'}}});assert.equal(authPage.data.mode,'login');
authPage.data.username='private_initial_admin';authPage.data.password=password;authPage.data.remember=true;active=true;await authPage.submit();assert.equal(saves,0);assert.equal(navigated,1);assert.equal(authPage.data.password,'');authPage.rememberChange({detail:{value:[]}});assert.equal(forgets,0,'Review session controls do not remove preserved credentials.');
active=false;review=false;await authPage.bootstrap();await Promise.resolve();assert.equal(loads,1);assert.equal(authPage.data.username,'historical_user');assert.equal(authPage.data.password,password,'The vault can be restored after review mode ends.');authPage.onUnload();
console.log('PASS remembered native login: platform-encrypted credentials, explicit consent, origin isolation, cancellation races, unsupported-device fallback, session-only versus persistent tokens, and isolated presence failures.');
