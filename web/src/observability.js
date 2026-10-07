// Bounded, anonymous request telemetry. No bodies, cookies, user IDs or raw IPs.
import {reviewEnabled} from './review-mode.js';
const DAY=86400000,RETENTION_DAYS=14,MAX_LOGS=1200,MAX_VISITORS=6000;
const initialized=new WeakMap(),cleanupAt=new WeakMap();
const securityCodes=new Set(['PASSWORD_LOCKED','PASSWORD_COOLDOWN','CAPTCHA_REJECTED']);
const knownRoutes=new Set(['captcha','info','setup','register','login','recover','logout','password','state','members','members/update','invite','reset-link','events/create','events/update','events/delete','events/reschedule','tasks/create','tasks/action','templates/save','profile/request','profile/review','settings/save','account/request','account/cancel','account/review','stats','stats/maintenance']);
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export function anonymousAddress(value){
 if(typeof value!=='string'||value.length>80)return {masked:'未知来源',normalized:''};
 const input=value.trim().toLowerCase();
 if(/^\d{1,3}(\.\d{1,3}){3}$/.test(input)){const parts=input.split('.').map(Number);if(parts.some(n=>n>255))return {masked:'未知来源',normalized:''};const normalized=parts.join('.'),local=parts[0]===10||parts[0]===127||parts[0]===0||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===169&&parts[1]===254;return {masked:local?'本机 / 内网':parts.slice(0,3).join('.')+'.0/24',normalized}}
 if(!/^[0-9a-f:]+$/.test(input)||!input.includes(':'))return {masked:'未知来源',normalized:''};
 try{const canonical=new URL('http://['+input+']/').hostname.slice(1,-1),halves=canonical.split('::');if(halves.length>2)return {masked:'未知来源',normalized:''};const left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[],parts=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;if(parts.length!==8)return {masked:'未知来源',normalized:''};const padded=parts.map(p=>parseInt(p,16).toString(16).padStart(4,'0')),local=canonical==='::1'||canonical==='::'||/^f[cd]/.test(padded[0])||/^fe[89ab]/.test(padded[0]);return {masked:local?'本机 / 内网':padded.slice(0,3).join(':')+'::/48',normalized:padded.join(':')}}catch{return {masked:'未知来源',normalized:''}}
}
export function requestCategory(req){let pathname='';try{pathname=new URL(req.url).pathname}catch{return 'unknown'}
 if(pathname==='/'||pathname==='/index.html')return 'page';
 if(pathname==='/mini/api')return 'mini';
 if(pathname==='/sop-docs.json')return 'knowledge';
 if(['/app.js','/style.css'].includes(pathname)||pathname.startsWith('/brand/')||pathname.startsWith('/guide/'))return 'asset';
 if(pathname.startsWith('/api/')){const route=pathname.slice(5);return knownRoutes.has(route)?'api:'+route:'api:unknown'}
 if(/(?:^|\/)(?:\.env(?:\.|$)|\.git(?:\/|$)|\.local(?:\/|$)|wp-admin(?:\/|$)|wp-login\.php|cloudflared-config\.yml)/i.test(pathname))return 'sensitive-probe';return 'unknown';
}
export function classifyRequest(req,status,security){const route=requestCategory(req);let code='',risk=false;
 if(securityCodes.has(security)){code=security;risk=true}else if(route==='sensitive-probe'){code='SENSITIVE_PATH_PROBE';risk=true}else if(status===429){code='RATE_LIMITED';risk=true}else if(status===403&&req.method==='POST'&&(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('x-fr-request')!=='1')){code='REQUEST_CHECK_REJECTED';risk=true}else if(route==='api:login'&&status===401){code='LOGIN_REJECTED';risk=true}else if(status>=500)code='REQUEST_FAILED';else if(status===403)code='PERMISSION_DENIED';else if(status===409)code='UPDATE_CONFLICT';else if(status>=400)code='REQUEST_REJECTED';
 return {route,code,risk};
}
export async function ensureObservability(db){
 if(!db)return '';if(initialized.has(db))return initialized.get(db);
 const promise=(async()=>{for(const sql of [
 'CREATE TABLE IF NOT EXISTS site_observer_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS site_metrics_daily (date TEXT PRIMARY KEY,pageviews INTEGER NOT NULL DEFAULT 0,requests INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,risks INTEGER NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS site_visitors (date TEXT NOT NULL,fingerprint TEXT NOT NULL,masked_ip TEXT NOT NULL,country TEXT NOT NULL,hits INTEGER NOT NULL DEFAULT 0,pageviews INTEGER NOT NULL DEFAULT 0,last_seen INTEGER NOT NULL,source TEXT NOT NULL,PRIMARY KEY(date,fingerprint))',
 'CREATE TABLE IF NOT EXISTS site_request_events (id TEXT PRIMARY KEY,time INTEGER NOT NULL,route TEXT NOT NULL,method TEXT NOT NULL,status INTEGER NOT NULL,code TEXT NOT NULL,risk INTEGER NOT NULL,duration INTEGER NOT NULL,masked_ip TEXT NOT NULL,country TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS site_events_time ON site_request_events(time)',
 'CREATE INDEX IF NOT EXISTS site_visitors_seen ON site_visitors(last_seen)'
 ])await db.prepare(sql).run();await db.prepare("INSERT OR IGNORE INTO site_observer_meta (key,value) VALUES ('salt',?)").bind(random()).run();return (await db.prepare("SELECT value FROM site_observer_meta WHERE key='salt'").first()).value})();initialized.set(db,promise);try{return await promise}catch(err){initialized.delete(db);throw err}
}
export async function pruneTelemetry(db,now=Date.now(),force=false){if(!force&&now-(cleanupAt.get(db)||0)<3600000)return;const cutoff=now-RETENTION_DAYS*DAY,date=new Date(cutoff).toISOString().slice(0,10);await db.batch([
 db.prepare('DELETE FROM site_request_events WHERE time<?').bind(cutoff),db.prepare('DELETE FROM site_visitors WHERE date<?').bind(date),db.prepare('DELETE FROM site_metrics_daily WHERE date<?').bind(date),
 db.prepare('DELETE FROM site_request_events WHERE id NOT IN (SELECT id FROM site_request_events ORDER BY time DESC,id DESC LIMIT ?)').bind(MAX_LOGS),
 db.prepare('DELETE FROM site_visitors WHERE rowid NOT IN (SELECT rowid FROM site_visitors ORDER BY last_seen DESC LIMIT ?)').bind(MAX_VISITORS)
 ]);cleanupAt.set(db,now)}
export async function recordRequest(req,res,env,started=Date.now()){
 let db=env?.DB;if(!db||env?.DISABLE_TELEMETRY)return;
 try{if(new URL(req.url).pathname==='/api/presence'||await reviewEnabled(db))return;const salt=await ensureObservability(db),now=Date.now(),date=new Date(now).toISOString().slice(0,10),{route,code,risk}=classifyRequest(req,res.status,res.headers?.get('X-FR-Security'));if(route==='api:stats'||route==='api:stats/maintenance')return;
 const metadata=env.TELEMETRY_CONTEXT||{},edge=req.cf&&typeof req.cf==='object'?req.cf:null,source=edge?'edge':metadata.source==='cloudflare'?'cloudflare':'unknown';
 const address=anonymousAddress(edge?req.headers.get('cf-connecting-ip'):metadata.ip||''),countryInput=edge?.country||metadata.country||'',country=source!=='unknown'&&/^[A-Z]{2}$/.test(countryInput)&&!['XX','T1'].includes(countryInput)?countryInput:'unknown';
 const fingerprint=await digest(salt+':'+date+':'+(address.normalized||'unknown')),pageview=route==='page'&&req.method==='GET'&&res.status<400?1:0,failed=res.status>=500?1:0,duration=Math.max(0,Math.min(60000,Math.round(now-started)));
 const statements=[db.prepare('INSERT INTO site_metrics_daily (date,pageviews,requests,failures,risks) VALUES (?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET pageviews=pageviews+excluded.pageviews,requests=requests+1,failures=failures+excluded.failures,risks=risks+excluded.risks').bind(date,pageview,1,failed,Number(risk))];
 if(route!=='asset')statements.push(db.prepare('INSERT INTO site_visitors (date,fingerprint,masked_ip,country,hits,pageviews,last_seen,source) VALUES (?,?,?,?,1,?,?,?) ON CONFLICT(date,fingerprint) DO UPDATE SET hits=hits+1,pageviews=pageviews+excluded.pageviews,last_seen=excluded.last_seen,country=excluded.country,source=excluded.source').bind(date,fingerprint,address.masked,country,pageview,now,source));
 if(code||pageview||route==='mini'||route.startsWith('api:')&&req.method==='POST')statements.push(db.prepare('INSERT INTO site_request_events (id,time,route,method,status,code,risk,duration,masked_ip,country) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),now,route,['GET','POST','HEAD'].includes(req.method)?req.method:'OTHER',res.status,code,Number(risk),duration,address.masked,country));
 if(code||pageview||route==='mini'||route.startsWith('api:')&&req.method==='POST')statements.push(db.prepare('DELETE FROM site_request_events WHERE rowid IN (SELECT rowid FROM site_request_events ORDER BY rowid DESC LIMIT -1 OFFSET ?)').bind(MAX_LOGS));
 if(route!=='asset')statements.push(db.prepare('DELETE FROM site_visitors WHERE rowid IN (SELECT rowid FROM site_visitors ORDER BY last_seen DESC LIMIT -1 OFFSET ?)').bind(MAX_VISITORS));
 await db.batch(statements);await pruneTelemetry(db,now);
 }catch{ // Observability must never break the workbench or echo raw exceptions.
 }
}
export async function readStatistics(db,days=14){await ensureObservability(db);await pruneTelemetry(db,Date.now(),true);days=[1,7,14].includes(days)?days:14;const start=new Date(Date.now()-(days-1)*DAY).toISOString().slice(0,10);
 const daily=(await db.prepare('SELECT date,pageviews,requests,failures,risks FROM site_metrics_daily WHERE date>=? ORDER BY date DESC').bind(start).all()).results;
 const counts=(await db.prepare('SELECT date,COUNT(*) AS visitors FROM site_visitors WHERE date>=? GROUP BY date').bind(start).all()).results;
 const countries=(await db.prepare('SELECT country,SUM(hits) AS requests,SUM(pageviews) AS pageviews,COUNT(*) AS visitorDays FROM site_visitors WHERE date>=? GROUP BY country ORDER BY requests DESC LIMIT 100').bind(start).all()).results;
 const networks=(await db.prepare('SELECT masked_ip AS network,SUM(hits) AS requests,SUM(pageviews) AS pageviews,COUNT(*) AS visitorDays,MAX(last_seen) AS lastSeen FROM site_visitors WHERE date>=? GROUP BY masked_ip ORDER BY requests DESC LIMIT 60').bind(start).all()).results;
 const events=(await db.prepare('SELECT id,time,route,method,status,code,risk,duration,masked_ip AS network,country FROM site_request_events WHERE time>=? ORDER BY time DESC LIMIT 100').bind(Date.parse(start+'T00:00:00Z')).all()).results;
 const codes=(await db.prepare("SELECT code,COUNT(*) AS count FROM site_request_events WHERE time>=? AND code<>'' GROUP BY code ORDER BY count DESC").bind(Date.parse(start+'T00:00:00Z')).all()).results;
 let legacy=0;try{legacy=Number((await db.prepare('SELECT SUM(hits) AS total FROM site_stats').first())?.total||0)}catch{}
 const totals=daily.reduce((s,d)=>({pageviews:s.pageviews+d.pageviews,requests:s.requests+d.requests,failures:s.failures+d.failures,risks:s.risks+d.risks}),{pageviews:0,requests:0,failures:0,risks:0});
 return {total:totals.pageviews,days:daily.map(d=>({...d,hits:d.pageviews,visitors:counts.find(c=>c.date===d.date)?.visitors||0})),summary:{...totals,visitorDays:counts.reduce((n,c)=>n+c.visitors,0),errorRate:totals.requests?Number((totals.failures/totals.requests*100).toFixed(2)):0},countries,networks,events,codes,legacyTotal:legacy,range:days,retentionDays:RETENTION_DAYS,privacy:{ip:'IPv4 /24 · IPv6 /48',identity:'daily salted hash; no account mapping',location:'country-level estimate only',maxLogs:MAX_LOGS,rawData:false},sampledAfter:new Date().toISOString()};
}
export async function maintainStatistics(db,action){await ensureObservability(db);if(action==='repair'){await pruneTelemetry(db,Date.now(),true);return {ok:true,action}}if(action==='clear'){await db.batch([db.prepare('DELETE FROM site_request_events'),db.prepare('DELETE FROM site_visitors'),db.prepare('DELETE FROM site_metrics_daily'),db.prepare("UPDATE site_observer_meta SET value=? WHERE key='salt'").bind(random())]);initialized.delete(db);return {ok:true,action}}return null}
