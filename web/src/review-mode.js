const initialized=new WeakMap();
export function rawReviewDB(db){return db.rawDB||db}
export async function ensureReviewMode(input){const db=rawReviewDB(input);if(!initialized.has(db))initialized.set(db,(async()=>{
 await db.prepare('CREATE TABLE IF NOT EXISTS review_configuration (id INTEGER PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,started INTEGER NOT NULL DEFAULT 0)').run();
 await db.prepare('INSERT OR IGNORE INTO review_configuration (id,enabled,started) VALUES (1,0,0)').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS review_users (user TEXT PRIMARY KEY,status TEXT NOT NULL)').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS review_workspace (id INTEGER PRIMARY KEY,version INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL)').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS review_site_stats (date TEXT PRIMARY KEY,hits INTEGER NOT NULL)').run();
 })().catch(error=>{initialized.delete(db);throw error}));return initialized.get(db)}
export async function reviewEnabled(db){await ensureReviewMode(db);return !!(await rawReviewDB(db).prepare('SELECT enabled FROM review_configuration WHERE id=1').first())?.enabled}
const keywords=new Set(['WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','CROSS','ORDER','GROUP','LIMIT','ON','UNION','HAVING','RETURNING']);
// The review workspace is a separate table; normal business records never move or disappear.
export function reviewScopedDB(db){if(db.reviewMode)return db;return {rawDB:db,reviewMode:true,prepare(sql){
 const scoped=sql.replace(/\b(workspace|member_profiles|member_preferences|account_requests|site_stats|site_observer_meta|site_metrics_daily|site_visitors|site_request_events|site_events_time|site_visitors_seen)\b/g,'review_$1').replace(/\b(FROM|JOIN)\s+users\b(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?/gi,(_,join,alias)=>{
  const keyword=alias&&keywords.has(alias.toUpperCase());return join+' (SELECT * FROM users WHERE owner=1) AS '+(alias&&!keyword?alias:'users')+(keyword?' '+alias:'');
 });return db.prepare(scoped)},batch:statements=>db.batch(statements)}}
// Public aliases never replace the credentials used to authenticate the administrator.
export function reviewPublicData(value,owner){
 const identityKeys=new Set(['id','user','user_id','createdBy','updatedBy','owner','owner_id','receiver','reviewer_id','owners','receivers','reviewers','target','submittedBy','archivedBy','approvedBy']);
 // Identity values can equal role/status/theme enums. Redact only typed identity fields.
 function visit(item,key,identityRecord=false){
  if(typeof item==='string'){
   if(identityKeys.has(key)&&item===owner.id)return 'review-admin';
   if(key==='username'&&identityRecord)return 'review_admin';
   if(key==='name'&&identityRecord)return '审核管理员';
   return item;
  }
  if(Array.isArray(item))return item.map(x=>visit(x,key));
  if(item&&typeof item==='object'){
   const isOwner=item.id===owner.id||item.user===owner.id||item.user_id===owner.id;
   return Object.fromEntries(Object.entries(item).map(([field,val])=>[field,field==='createdByName'&&item.createdBy===owner.id||field==='updatedByName'&&item.updatedBy===owner.id?'审核管理员':visit(val,field,isOwner)]));
  }
  return item;
 }
 return visit(value);
}
