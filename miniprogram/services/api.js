const defaults=require('../config'),Recovery=require('../utils/recovery');
const READ_PATHS=new Set(['info','state','members','sop','wechat/status','health','stats']);
const AUTH_PATHS=new Set(['setup','login','register','recover','wechat/login']);
const SECURITY_PATHS=new Set(['captcha']);
let state=null,inFlight=null,generation=0,authEpoch=0,initializedCloud='',ownerSession='',ownerUser='',readOnly=false,revoked=false,volatileToken;
const listeners=new Set();
function config(){return Recovery.normalizeConnection(Recovery.safeRead('fr.connection',{}),defaults)}
function token(){if(revoked)return '';const raw=volatileToken===undefined?Recovery.safeRead('fr.token',''):volatileToken;return typeof raw==='string'&&raw.length<=512&&/^[a-zA-Z0-9._~-]+$/.test(raw)?raw:''}
function notify(next){for(const fn of listeners)try{fn(next)}catch(e){Recovery.capture(e,'render')}}
function discardSnapshot(announce=false){generation+=1;state=null;inFlight=null;ownerSession='';ownerUser='';readOnly=false;if(announce)notify(null)}
function saveToken(value){const next=typeof value==='string'&&value.length<=512&&/^[a-zA-Z0-9._~-]+$/.test(value)?value:'';if(next!==token())discardSnapshot();revoked=!next;volatileToken=undefined;if(next){if(!Recovery.safeWrite('fr.token',next))volatileToken=next}else if(!Recovery.safeRemove('fr.token'))Recovery.safeWrite('fr.token','')}
function clear(){discardSnapshot(true);authEpoch+=1;revoked=true;volatileToken=undefined;if(!Recovery.safeRemove('fr.token'))Recovery.safeWrite('fr.token','')}
function getState(){if(!state)return null;if(!token()||ownerSession!==token()||ownerUser!==state.user?.id){discardSnapshot();return null}return state}
function isReadOnly(){return !!getState()&&readOnly}
function fail(message,status,transient=false){const e=new Error(message);e.status=status;e.transient=transient;return e}
function directRequest(base,payload){return new Promise((resolve,reject)=>{try{wx.request({url:base+'/mini/api',method:'POST',data:payload,header:{'content-type':'application/json'},timeout:12000,success:r=>{if([408,429,502,503,504].includes(r.statusCode)&&(!r.data||typeof r.data.status!=='number'))reject(fail('暂时无法同步，请稍后刷新。',r.statusCode,true));else resolve(r.data)},fail:()=>reject(fail('暂时无法同步，请稍后刷新。',0,true))})}catch{reject(fail('当前设备暂时无法发起同步。',0,false))}})}
async function cloudRequest(c,payload){if(!c.cloudEnv)throw fail('尚未配置云开发环境，请先使用本机连接',400);if(!wx.cloud)throw fail('当前微信版本不支持云开发',400);try{if(initializedCloud!==c.cloudEnv){wx.cloud.init({env:c.cloudEnv,traceUser:false});initializedCloud=c.cloudEnv}const r=await wx.cloud.callFunction({name:c.cloudFunction,data:payload,config:{env:c.cloudEnv}});return r.result}catch{throw fail('暂时无法同步，请稍后刷新。',0,true)}}
function markReadOnly(){const snapshot=getState();if(!snapshot)return null;readOnly=true;state={...snapshot,_localReadOnly:true};notify(state);return state}
async function call(path,data){
 if(typeof path!=='string'||!(/^[a-z0-9/_-]{1,100}$/i.test(path)))throw fail('操作路径无效',400);
 const read=READ_PATHS.has(path),auth=AUTH_PATHS.has(path);
 if(!read&&!auth&&!SECURITY_PATHS.has(path)&&path!=='logout'&&isReadOnly())throw fail('当前为只读快照，请刷新恢复同步后再操作。',409);
 if(auth)discardSnapshot(true);
 const epoch=auth?++authEpoch:authEpoch,c=config(),session=token(),payload={path,token:session};if(data!==undefined)payload.data=data;
 let result;
 try{for(let attempt=0;attempt<(read?2:1);attempt++){try{result=c.transport==='cloud'?await cloudRequest(c,payload):await directRequest(c.directBaseUrl,payload);if(!result||typeof result.status!=='number')throw fail('响应格式异常，请刷新后重试。',0,false);if(result.status>=400){if(result.status===401&&!auth){clear();throw fail('登录已过期，请重新登录。',401)}const error=fail(typeof result.body?.error==='string'?result.body.error.slice(0,500):'暂未完成操作',result.status,[408,502,503,504].includes(result.status));for(const key of ['code','retryAfter','failures','captchaRequired','locked'])if(Object.hasOwn(result.body||{},key))error[key]=result.body[key];throw error}break}catch(e){if(read&&e.transient&&attempt===0&&session===token()){await new Promise(resolve=>setTimeout(resolve,250));continue}throw e}}}
 catch(e){if(!read&&e.transient)markReadOnly();if(path==='logout')clear();throw e}
 if(auth&&epoch!==authEpoch)throw fail('登录状态已更新，请重新进入界面。',409);
 if(!auth&&path!=='logout'&&session!==token())throw fail('登录状态已更新，请刷新当前页面。',409);
 if(result.sessionToken)saveToken(result.sessionToken);if(path==='logout')clear();return result.body;
}
function validState(s){return !!s&&typeof s==='object'&&!Array.isArray(s)&&!!s.user&&typeof s.user.id==='string'&&s.user.id.length>0&&['admin','manager','member'].includes(s.user.role)&&Array.isArray(s.people)&&Array.isArray(s.events)&&Array.isArray(s.tasks)}
async function refresh(force=false){
 const session=token();if(!session){discardSnapshot();return null}if(inFlight&&!force)return inFlight;
 const current=++generation;
 const work=call('state').then(next=>{if(!validState(next)){Recovery.capture(null,'schema');throw fail('页面数据格式异常，当前内容暂为只读。',0,false)}if(current!==generation||session!==token())return null;const safe={...next,settings:Recovery.applySettings(next.settings),ledger:Array.isArray(next.ledger)?next.ledger:[],notices:Array.isArray(next.notices)?next.notices:[],templates:Array.isArray(next.templates)?next.templates:[],ranking:Array.isArray(next.ranking)?next.ranking:[],_localReadOnly:false};ownerSession=session;ownerUser=safe.user.id;readOnly=false;state=safe;Recovery.saveDisplay(safe.settings);notify(safe);return safe}).catch(e=>{if(current!==generation||session!==token()||e.status===401||e.status===403){if(e.status===403)clear();throw e}const snapshot=markReadOnly();if(snapshot)return snapshot;throw e}).finally(()=>{if(inFlight===work)inFlight=null});inFlight=work;return work;
}
async function mutate(path,data){const result=await call(path,data);if(path==='settings/save')Recovery.clearOverride();await refresh(true);return result}
function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}
function setConnection(next){clear();initializedCloud='';Recovery.safeWrite('fr.connection',Recovery.normalizeConnection(next,defaults))}
module.exports={call,refresh,mutate,subscribe,config,setConnection,clear,token,getState,isReadOnly,discardSnapshot,info:()=>call('info')};
