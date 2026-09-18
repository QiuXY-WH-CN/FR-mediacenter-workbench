const defaults=require('../config');
let state=null,inFlight=null,listeners=[],generation=0,initializedCloud='';
const config=()=>Object.assign({},defaults,wx.getStorageSync('fr.connection')||{});
const token=()=>wx.getStorageSync('fr.token')||'';
function clear(){generation++;state=null;inFlight=null;wx.removeStorageSync('fr.token');listeners.forEach(fn=>fn(null));}
async function call(path,data){
  const c=config(),payload={path,token:token()};if(data!==undefined)payload.data=data;
  let result;
  if(c.transport==='cloud'){
    if(!c.cloudEnv)throw Error('尚未配置云开发环境，请先使用本机连接');
    if(!wx.cloud)throw Error('当前微信版本不支持云开发');
    if(initializedCloud!==c.cloudEnv){wx.cloud.init({env:c.cloudEnv,traceUser:false});initializedCloud=c.cloudEnv;}
    const response=await wx.cloud.callFunction({name:c.cloudFunction,data:payload,config:{env:c.cloudEnv}});result=response.result;
  }else{
    const base=(c.directBaseUrl||'').replace(/\/$/,'');if(!/^https?:\/\//.test(base))throw Error('请设置有效的服务器地址');
    result=await new Promise((resolve,reject)=>wx.request({url:base+'/mini/api',method:'POST',data:payload,header:{'content-type':'application/json'},timeout:15000,success:r=>resolve(r.data),fail:()=>reject(Error('无法连接本机。开发者工具可用 127.0.0.1；手机需使用同一 Wi-Fi 下电脑的局域网地址，或配置云入口。'))}));
  }
  if(!result||typeof result.status!=='number')throw Error('服务器响应异常');
  if(result.status>=400){if(result.status===401)clear();const error=Error(result.body?.error||'操作失败');error.status=result.status;throw error}
  if(result.sessionToken)wx.setStorageSync('fr.token',result.sessionToken);
  if(path==='logout')clear();
  return result.body;
}
function subscribe(fn){listeners.push(fn);return()=>listeners=listeners.filter(x=>x!==fn)}
async function refresh(force=false){
  if(!token())return null;
  if(inFlight&&!force)return inFlight;
  const current=++generation;
  const work=call('state').then(next=>{if(current===generation){state=next;listeners.forEach(fn=>fn(next))}return next}).finally(()=>{if(inFlight===work)inFlight=null});
  inFlight=work;return work;
}
async function mutate(path,data){const result=await call(path,data);await refresh(true);return result;}
function setConnection(next){clear();wx.setStorageSync('fr.connection',Object.assign({},defaults,next));}
module.exports={call,refresh,mutate,subscribe,config,setConnection,clear,token,getState:()=>state};
