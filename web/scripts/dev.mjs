import http from 'node:http';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {database} from './local-db.mjs';
import worker from '../dist/server/index.js';
import {createMiniGateway} from './mini-gateway.mjs';

const lan = process.argv.includes('--lan') || process.env.HOST === '0.0.0.0';
const port = Number(process.env.PORT || 8766);
const host = lan ? '0.0.0.0' : '127.0.0.1';
await mkdir('.local',{recursive:true});
const DB = database(process.env.DB_PATH || '.local/preview.db');
const exists = DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
if(!exists) for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()) DB.sqlite.exec(await readFile('drizzle/'+f,'utf8'));
const env = {DB, BOOTSTRAP_HASH: createHash('sha256').update('local-preview-only-setup').digest('hex')};
const mini = createMiniGateway({worker, DB});

const server = http.createServer(async(req,res)=>{
  try{
    const chunks=[];let size=0;
    for await(const c of req){size+=c.length;if(size>100000){res.writeHead(413);res.end('Request too large');return}chunks.push(c)}
    const origin = `http://${req.headers.host || 'localhost'}`;
    const url = new URL(req.url, origin);
    const hasBody = !['GET','HEAD'].includes(req.method||'GET');
    const request = new Request(url.toString(),{method:req.method,headers:new Headers(req.headers),...(hasBody?{body:Buffer.concat(chunks)}:{})});
    const response = url.pathname === '/mini/api' ? await mini(request, env) : await worker.fetch(request, env);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){
    console.error(e);
    if(!res.headersSent) res.writeHead(500);
    res.end('Local server error');
  }
});
server.on('error',e=>{
  if(e.code==='EADDRINUSE') console.error(`端口 ${port} 已占用，请打开已运行的工作台。`);
  else console.error(e);
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
