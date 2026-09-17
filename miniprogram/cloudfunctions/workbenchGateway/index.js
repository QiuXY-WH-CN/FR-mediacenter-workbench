const cloud=require('wx-server-sdk');
const {createHmac,randomBytes}=require('crypto');
const https=require('https');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
// Deploy as a Mini Program cloud function only. Do not add an HTTP trigger.
exports.main=async event=>{
  const ctx=cloud.getWXContext();
  const source=ctx.SOURCE;
  if(!ctx.OPENID||ctx.APPID!==process.env.MINI_APP_ID||(source&&!['wx_client','wx_devtools'].includes(source)))return {status:403,body:{error:'仅允许本小程序调用'}};
  const target=process.env.LOCAL_API_ORIGIN,secret=process.env.BRIDGE_SECRET;
  if(!target||!secret||secret.length<32)return {status:503,body:{error:'云函数尚未配置本机 HTTPS 入口和桥接密钥'}};
  let endpoint;try{endpoint=new URL('/mini/api',target);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw Error()}catch{return {status:503,body:{error:'本机 HTTPS 入口配置无效'}}}
  const data=JSON.stringify({path:event.path,data:event.data,token:event.token,_identity:{appid:ctx.APPID,openid:ctx.OPENID}});
  if(Buffer.byteLength(data)>100000)return {status:413,body:{error:'请求内容过大'}};
  const stamp=String(Date.now()),nonce=randomBytes(16).toString('hex');
  const signature=createHmac('sha256',secret).update(stamp+'\n'+nonce+'\n'+data).digest('hex');
  return new Promise(resolve=>{
    const request=https.request(endpoint,{method:'POST',timeout:12000,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),'X-FR-Cloud-Time':stamp,'X-FR-Cloud-Nonce':nonce,'X-FR-Cloud-Signature':signature}},response=>{
      let body='',size=0;response.on('data',chunk=>{size+=chunk.length;if(size>6*1024*1024){request.destroy();return}body+=chunk});response.on('end',()=>{try{resolve(JSON.parse(body))}catch{resolve({status:502,body:{error:'本机返回了无效响应'}})}});
    });
    request.on('timeout',()=>request.destroy());request.on('error',()=>resolve({status:503,body:{error:'暂时无法连接本机，请确认电脑和连接服务在线'}}));request.end(data);
  });
};
