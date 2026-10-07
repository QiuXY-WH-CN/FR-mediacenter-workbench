// Local operator verification. No account details, credentials, payloads or session tokens are printed.
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {database} from './local-db.mjs';
import {reviewEnabled} from '../src/review-mode.js';
import worker from '../dist/server/index.js';
import {createMiniGateway} from './mini-gateway.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),db=database(resolve(root,process.env.DB_PATH||'.local/preview.db'));
const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex'),origin='https://local-review-audit.invalid';
try{
 assert.ok(await reviewEnabled(db),'Review must be enabled before this audit');
 const owner=db.sqlite.prepare("SELECT id,username,name FROM users WHERE owner=1 AND status='active'").get();assert.ok(owner,'Initial administrator must be available');assert.ok(db.sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE status<>'disabled' AND COALESCE(owner,0)=0").get().count===0,'Other accounts must be disabled');
 const original=db.sqlite.prepare('SELECT data FROM workspace WHERE id=1').get()?.data;
 db.sqlite.prepare('INSERT INTO sessions (hash,user,expires) VALUES (?,?,?)').run(hash,owner.id,Date.now()+60000);
 const env={DB:db,DISABLE_TELEMETRY:true},cookie='fr_session_v2='+token;
 async function read(path){const response=await worker.fetch(new Request(origin+'/api/'+path,{headers:{Cookie:cookie}}),env);assert.ok(response.status===200,'Authenticated review endpoint failed: '+path);return response.json()}
 const state=await read('state');assert.ok(state.reviewMode&&state.user.id==='review-admin'&&state.user.username==='review_admin'&&state.user.name==='审核管理员'&&!state.user.avatar,'Public review identity must be anonymous');
 assert.ok(state.user.role==='admin'&&state.user.status==='active'&&state.people.every(p=>p.role==='admin'&&p.status==='active'),'Review masking must retain role and status enums');
 assert.ok(state.people.length===1&&state.ranking.length===1&&!state.profile&&!state.accountRequest,'Historical account metadata must be hidden');
 for(const key of ['events','tasks','ledger','logs','notices'])assert.ok(state[key].length===0,'Review workspace must start empty: '+key);
 assert.ok(state.templates.every(t=>!t.createdBy),'Custom templates must be hidden');
 const members=await read('members');assert.ok(members.members.length===1&&members.reviews.length===0&&members.closures.length===0,'Member review endpoint must hide all historical accounts');
 const stats=await read('stats');for(const key of ['days','countries','networks','events','codes'])assert.ok(stats[key].length===0,'Historical telemetry must be hidden: '+key);assert.ok(stats.legacyTotal===0,'Legacy statistics must be hidden');
 const gateway=createMiniGateway({worker,DB:db,root});for(const path of ['state','members','stats']){const response=await gateway(new Request(origin+'/mini/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,token})}),env);const result=await response.json();assert.ok(result.status===200,'Mini review endpoint failed: '+path);if(path==='state')assert.ok(result.body.user.id==='review-admin'&&result.body.user.role==='admin'&&result.body.events.length===0,'Mini review workspace must be anonymous and empty, with a valid admin role')}
 assert.ok(db.sqlite.prepare('SELECT data FROM workspace WHERE id=1').get()?.data===original,'The audit must not change original workspace data');
 console.log(JSON.stringify({passed:true,availableAccounts:1,historicalDataVisible:false,miniGatewayChecked:true,statisticsEmpty:true,originalWorkspacePreserved:true}));
}finally{db.sqlite.prepare('DELETE FROM sessions WHERE hash=?').run(hash);db.sqlite.close()}
