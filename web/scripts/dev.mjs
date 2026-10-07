import http from 'node:http';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {isIP} from 'node:net';
import {recordRequest} from '../src/observability.js';
import {database} from './local-db.mjs';
import worker from '../dist/server/index.js';
import {createMiniGateway} from './mini-gateway.mjs';
import {rollbackGate} from './rollback-gate.mjs';
import {reviewEnabled} from '../src/review-mode.js';

const lan = process.argv.includes('--lan') || process.env.HOST === '0.0.0.0';
const port = Number(process.env.PORT || 8766);
const host = lan ? '0.0.0.0' : '127.0.0.1';
await mkdir('.local',{recursive:true});
const DB = database(process.env.DB_PATH || '.local/preview.db');
const exists = DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
if(!exists) for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()) DB.sqlite.exec(await readFile('drizzle/'+f,'utf8'));
try{const envText=await readFile('.env','utf8');for(const line of envText.split(/\r?\n/)){const m=line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2]}}catch{}
const bootstrapHash = process.env.BOOTSTRAP_HASH || '';
if(!bootstrapHash) console.warn('[security] 未配置初始化凭据，首次管理员初始化已禁用。');
DB.sqlite.exec('CREATE TABLE IF NOT EXISTS site_stats (date TEXT PRIMARY KEY, hits INTEGER NOT NULL)');
const env = {DB, BOOTSTRAP_HASH: bootstrapHash};
const mini = createMiniGateway({worker, DB});

const server = http.createServer(async(req,res)=>{
  const started=Date.now();
  try{
    const chunks=[];let size=0;
    for await(const c of req){size+=c.length;if(size>100000){res.writeHead(413);res.end('Request too large');return}chunks.push(c)}
    const proto = String(req.headers['x-forwarded-proto']||'').toLowerCase()==='https' ? 'https' : 'http';
    const origin = `${proto}://${req.headers.host || 'localhost'}`;
    const url = new URL(req.url, origin);
    const hasBody = !['GET','HEAD'].includes(req.method||'GET');
    const request = new Request(url.toString(),{method:req.method,headers:new Headers(req.headers),...(hasBody?{body:Buffer.concat(chunks)}:{})});
    const peer=req.socket.remoteAddress||'',forwarded=String(req.headers['cf-connecting-ip']||''),loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);
    const edgeForwarded=!lan&&loopback&&/^[a-f0-9]{16}-[a-z0-9]{3,8}$/i.test(String(req.headers['cf-ray']||''))&&isIP(forwarded)>0;
    const requestEnv={...env,TELEMETRY_CONTEXT:{source:edgeForwarded?'cloudflare':'unknown',ip:edgeForwarded?forwarded:peer,country:edgeForwarded?String(req.headers['cf-ipcountry']||''):''}};
    const readOnly=process.env.WORKBENCH_ROLLBACK_READONLY==='1';
    const response = await rollbackGate(request,readOnly,readOnly&&await reviewEnabled(DB)) || (url.pathname === '/mini/api' ? await mini(request, {...requestEnv,DISABLE_TELEMETRY:true}) : await worker.fetch(request, requestEnv));
    if(url.pathname==='/mini/api'){
      let status=502,security='';try{const body=await response.clone().json();if(Number.isInteger(body.status)&&body.status>=100&&body.status<=599)status=body.status;if(['PASSWORD_LOCKED','PASSWORD_COOLDOWN','CAPTCHA_REJECTED'].includes(body.body?.code))security=body.body.code}catch{}
      await recordRequest(request,{status,headers:new Headers({'X-FR-Security':security})},requestEnv,started);
    }
    const headers = Object.fromEntries(response.headers);
    if(proto==='https') headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    res.writeHead(response.status,headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){
    console.error('LOCAL_REQUEST_FAILED');
    if(!res.headersSent) res.writeHead(500);
    res.end('Local server error');
  }
});
server.on('error',e=>{
  if(e.code==='EADDRINUSE') console.error(`端口 ${port} 已占用，请打开已运行的工作台。`);
  else console.error('LOCAL_LISTENER_FAILED');
  process.exitCode=1;
});
server.listen(port,host,()=>{
  console.log(`Local: http://127.0.0.1:${port}`);
  if(lan){
    for(const list of Object.values(networkInterfaces())){
      for(const item of list||[]){
        if(item.family==='IPv4'&&!item.internal) console.log(`LAN:   http://${item.address}:${port}`);
      }
    }
  }
});
process.on('SIGINT',()=>server.close(()=>{DB.sqlite.close();process.exit(0)}));
