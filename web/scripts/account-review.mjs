import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {createConnection} from 'node:net';
import {database} from './local-db.mjs';
import {ensureReviewMode,reviewEnabled,reviewScopedDB} from '../src/review-mode.js';
import {ensureProfiles} from '../src/profiles.js';
import {ensurePreferences} from '../src/preferences.js';
import {ensureObservability} from '../src/observability.js';

export async function setAccountReview(db,enabled){
 await ensureReviewMode(db);const wasEnabled=await reviewEnabled(db);
 const counts=()=>({reviewMode:!!db.sqlite.prepare('SELECT enabled FROM review_configuration WHERE id=1').get().enabled,available:db.sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE status='active'").get().count,sealed:db.sqlite.prepare('SELECT COUNT(*) AS count FROM review_users').get().count});
 if(wasEnabled===enabled)return {...counts(),changed:false};
 const owners=db.sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE owner=1 AND status='active' AND role='admin'").get().count;
 if(owners!==1||db.sqlite.prepare('SELECT COUNT(*) AS count FROM users WHERE owner=1').get().count!==1)throw Error('需要一个有效的初始管理员，操作已取消');
 if(enabled){const scoped=reviewScopedDB(db);await ensureProfiles(scoped);await ensurePreferences(scoped);await ensureObservability(scoped)}
 db.sqlite.exec('BEGIN IMMEDIATE');try{
  if(enabled){
   db.sqlite.exec('DELETE FROM review_users; INSERT INTO review_users (user,status) SELECT id,status FROM users WHERE COALESCE(owner,0)=0;');
   db.sqlite.prepare("UPDATE users SET status='disabled' WHERE COALESCE(owner,0)=0").run();
   // Every new review period starts empty; the original workspace and profile tables stay intact.
   for(const table of ['review_workspace','review_member_profiles','review_member_preferences','review_account_requests','review_site_stats','review_site_metrics_daily','review_site_visitors','review_site_request_events'])db.sqlite.exec('DELETE FROM '+table);
   db.sqlite.prepare('INSERT INTO review_workspace (id,version,data) VALUES (1,0,?)').run(JSON.stringify({events:[],tasks:[],templates:[],logs:[],notices:[],ledger:[],cases:[]}));
  }else{
   db.sqlite.exec('UPDATE users SET status=(SELECT status FROM review_users WHERE user=users.id) WHERE id IN (SELECT user FROM review_users); DELETE FROM review_users;');
  }
  // Revoke every old browser and mini session, including the owner's cached real identity.
  db.sqlite.exec('DELETE FROM sessions');
  if(db.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='member_presence'").get())db.sqlite.exec('DELETE FROM member_presence');
  if(db.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workspace'").get())db.sqlite.exec('UPDATE workspace SET version=version+1');
  db.sqlite.prepare('UPDATE review_configuration SET enabled=?,started=? WHERE id=1').run(enabled?1:0,enabled?Date.now():0);
  db.sqlite.exec('COMMIT');return {...counts(),changed:true};
 }catch(error){db.sqlite.exec('ROLLBACK');throw error}
}

export function requireStoppedOrigin(port=Number(process.env.PORT||8766)){
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('源服务端口无效');
 return new Promise((resolve,reject)=>{const socket=createConnection({host:'127.0.0.1',port});socket.setTimeout(2000);socket.once('connect',()=>{socket.destroy();reject(Error('请先暂停源服务再切换审核封存，防止在途请求修改历史数据'))});socket.once('timeout',()=>{socket.destroy();reject(Error('无法确认源服务已经停止，操作已取消'))});socket.once('error',error=>{socket.destroy();if(error.code==='ECONNREFUSED')resolve();else reject(Error('无法确认源服务已经停止，操作已取消'))})})
}

const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const command=process.argv[2]||'status';if(!['seal','restore','status'].includes(command))throw Error('用法：node scripts/account-review.mjs seal|restore|status');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dbPath=resolve(root,process.env.DB_PATH||'.local/preview.db'),db=database(dbPath);
 try{await ensureReviewMode(db);
  if(command==='status'){console.log(JSON.stringify({reviewMode:await reviewEnabled(db),available:db.sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE status='active'").get().count,sealed:db.sqlite.prepare('SELECT COUNT(*) AS count FROM review_users').get().count}))}
  else{const enabled=command==='seal';if(enabled!==await reviewEnabled(db)){await requireStoppedOrigin();const backupDirectory=join(root,'.local','account-seal');await mkdir(backupDirectory,{recursive:true});const backup=join(backupDirectory,'before-'+command+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');db.sqlite.prepare('VACUUM INTO ?').run(backup)}console.log(JSON.stringify(await setAccountReview(db,enabled)))}
 }finally{db.sqlite.close()}
}
