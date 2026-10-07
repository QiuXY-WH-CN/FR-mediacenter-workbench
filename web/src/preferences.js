import bcrypt from 'bcryptjs';
import ParticleEngine from '../../miniprogram/utils/particle-engine.js';
import TaskModel from '../../miniprogram/utils/task-model.js';
export const defaults={workspace:'',themeColor:'#e77b24',appearance:'light',particles:'constellation',particleDensity:48,rotationMinutes:5,motion:true,language:'zh-CN',fontScale:1,particleSystem:{...ParticleEngine.defaults}};
export async function ensurePreferences(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS member_preferences (user TEXT PRIMARY KEY,data TEXT NOT NULL)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS account_requests (user TEXT PRIMARY KEY,reason TEXT NOT NULL,status TEXT NOT NULL,requested INTEGER NOT NULL,revision INTEGER NOT NULL,review_note TEXT NOT NULL DEFAULT '')").run();
}
export function normalizePreferenceData(input){const s=input&&typeof input==='object'&&!Array.isArray(input)?input:{},out={...defaults,particleSystem:ParticleEngine.normalize(s.particleSystem)};
 if(['','办公室','新媒体运营部','视觉传达部','创意设计部'].includes(s.workspace))out.workspace=s.workspace;
 if(typeof s.themeColor==='string'&&/^#[0-9a-f]{6}$/i.test(s.themeColor))out.themeColor=s.themeColor;
 for(const [key,allowed] of [['appearance',['light','dark','auto']],['language',['zh-CN','en']],['particles',['off','constellation','fireflies','snow','petals','rain','orbits','stars','bubbles','random','rotate']]])if(allowed.includes(s[key]))out[key]=s[key];
 if(typeof s.motion==='boolean')out.motion=s.motion;
 for(const [key,min,max]of [['fontScale',.85,1.35],['particleDensity',10,80],['rotationMinutes',1,60]])if(Number.isFinite(s[key]))out[key]=Math.max(min,Math.min(max,key==='fontScale'?s[key]:Math.round(s[key])));return out;
}
export async function readPreferences(db,u){const row=await db.prepare('SELECT data FROM member_preferences WHERE user=?').bind(u.id).first();let stored={};try{stored=row?JSON.parse(row.data):{}}catch{}return normalizePreferenceData(stored)}
export async function preferenceRoutes(path,b,u,db,{fail,text,departments}){
 if(path==='/api/settings/save'){
  const old=await readPreferences(db,u),next={...old,...b};
  if(!departments.includes(next.workspace)&&next.workspace!=='')fail(400,'请选择有效的部门模式');
  if(!['zh-CN','en'].includes(next.language))fail(400,'语言无效');
  if(typeof next.themeColor!=='string'||!/^#[a-fA-F0-9]{6}$/.test(next.themeColor)||!['light','dark','auto'].includes(next.appearance)||!['off','constellation','fireflies','snow','petals','rain','orbits','stars','bubbles','random','rotate'].includes(next.particles))fail(400,'外观设置无效');
  if(!Number.isInteger(next.particleDensity)||next.particleDensity<10||next.particleDensity>80||!Number.isInteger(next.rotationMinutes)||next.rotationMinutes<1||next.rotationMinutes>60||typeof next.motion!=='boolean')fail(400,'动画设置无效');
  if(!Number.isFinite(next.fontScale)||next.fontScale<.85||next.fontScale>1.35)fail(400,'字号须在 85%—135% 之间');
  if(b.particleSystem!==undefined&&(!b.particleSystem||typeof b.particleSystem!=='object'||Array.isArray(b.particleSystem)))fail(400,'粒子设置无效');
  const system={...old.particleSystem,...(b.particleSystem||{})};
  for(const [k,r]of Object.entries(ParticleEngine.rules)){
   const v=system[k];
   if(r.min!==undefined&&(!Number.isFinite(v)||v<r.min||v>r.max)||r.values&&!r.values.includes(v)||r.type==='boolean'&&typeof v!=='boolean'||r.type==='color'&&(typeof v!=='string'||!/^#[a-fA-F0-9]{6}$/.test(v)))fail(400,'粒子参数超出范围或格式无效');
  }
  next.particleSystem=ParticleEngine.normalize(system);
  const data=Object.fromEntries(Object.keys(defaults).map(k=>[k,next[k]]));
  const saved=await db.prepare("INSERT INTO member_preferences (user,data) SELECT ?,? WHERE EXISTS (SELECT 1 FROM users WHERE id=? AND status='active') ON CONFLICT(user) DO UPDATE SET data=excluded.data").bind(u.id,JSON.stringify(data),u.id).run();if(!saved.meta.changes)fail(403,'账号已停用');return {ok:true,settings:data};
 }
 if(path==='/api/account/request'){
  if(u.owner)fail(403,'初始管理员请先联系项目维护者完成负责人移交，再申请注销');
  if(typeof b.password!=='string'||!await bcrypt.compare(b.password,u.password))fail(400,'当前密码不正确');
  const reason=text(b.reason,500);
  const requested=await db.prepare("INSERT INTO account_requests (user,reason,status,requested,revision) SELECT ?,?,'pending',?,1 WHERE EXISTS (SELECT 1 FROM users WHERE id=? AND status='active' AND COALESCE(owner,0)=0) ON CONFLICT(user) DO UPDATE SET reason=excluded.reason,status='pending',requested=excluded.requested,revision=revision+1,review_note=''").bind(u.id,reason,Date.now(),u.id).run();if(!requested.meta.changes)fail(403,'账号已停用或不能申请注销');return {ok:true};
 }
 if(path==='/api/account/cancel'){await db.prepare("UPDATE account_requests SET status='cancelled' WHERE user=? AND status='pending'").bind(u.id).run();return {ok:true}}
 if(path==='/api/account/review'){
  if(u.role!=='admin')fail(403,'只有管理员可以审核注销申请');
  if(!['approve','reject'].includes(b.action))fail(400,'审核操作无效');
  const id=text(b.id),revision=Number(b.revision),note=b.note?text(b.note,300):'';if(!Number.isSafeInteger(revision)||revision<1)fail(400,'申请版本无效');
  for(let attempt=0;attempt<3;attempt++){
   await db.prepare('INSERT OR IGNORE INTO workspace (id,version,data) VALUES (1,0,?)').bind(JSON.stringify({events:[],tasks:[],logs:[],notices:[]})).run();const row=await db.prepare('SELECT version,data FROM workspace WHERE id=1').first();
   const actor=await db.prepare('SELECT role,status FROM users WHERE id=?').bind(u.id).first();if(!actor||actor.status!=='active'||actor.role!=='admin')fail(403,'只有管理员可以审核注销申请');
   const request=await db.prepare("SELECT account_requests.*,users.owner FROM account_requests JOIN users ON users.id=account_requests.user WHERE user=? AND revision=? AND account_requests.status='pending'").bind(id,revision).first();
   if(!request)fail(409,'申请已变更，请刷新');if(request.owner||request.user===u.id)fail(403,'不能注销此账号');
   const authority="EXISTS (SELECT 1 FROM users WHERE id=? AND role='admin' AND status='active') AND EXISTS (SELECT 1 FROM users WHERE id=? AND COALESCE(owner,0)=0 AND id<>?)",authorityArgs=[u.id,id,u.id];
   if(b.action==='reject'){
    const result=await db.prepare("UPDATE account_requests SET status='rejected',review_note=? WHERE user=? AND revision=? AND status='pending' AND "+authority).bind(note,id,revision,...authorityArgs).run();if(result.meta.changes)return {ok:true};continue;
   }
   const s=JSON.parse(row.data);if((s.tasks||[]).some(t=>t.status!=='done'&&TaskModel.participants(t).includes(id)))fail(409,'该成员有未完成的负责或验收任务，请先完成交接');
   // A transaction-only token keeps a failed version/revision check from deleting any member data.
   const token='reviewing:'+crypto.randomUUID(),versionGuard='EXISTS (SELECT 1 FROM workspace WHERE id=1 AND version=?) AND '+authority,versionArgs=[row.version,...authorityArgs];
   const condition='EXISTS (SELECT 1 FROM account_requests WHERE user=? AND revision=? AND status=?) AND '+versionGuard,args=[id,revision,token,...versionArgs];
   const results=await db.batch([
    db.prepare("UPDATE account_requests SET status=?,review_note=? WHERE user=? AND revision=? AND status='pending' AND "+versionGuard).bind(token,note,id,revision,...versionArgs),
    db.prepare("UPDATE users SET status='disabled',name='已注销成员',username=?,role='member' WHERE id=? AND "+condition).bind('closed-'+id,id,...args),
    db.prepare('DELETE FROM sessions WHERE user=? AND '+condition).bind(id,...args),
    db.prepare('DELETE FROM member_profiles WHERE user=? AND '+condition).bind(id,...args),
    db.prepare('DELETE FROM member_preferences WHERE user=? AND '+condition).bind(id,...args),
    db.prepare('UPDATE workspace SET version=version+1 WHERE id=1 AND '+condition).bind(...args),
    db.prepare("UPDATE account_requests SET status='approved' WHERE user=? AND revision=? AND status=? AND "+versionGuard).bind(id,revision,token,row.version+1,...authorityArgs)
   ]);
   if(results[0].meta.changes&&results[1].meta.changes&&results[5].meta.changes&&results[6].meta.changes)return {ok:true};
  }
  fail(409,'其他成员刚刚更新了数据或申请，请刷新后重试');
 }
 return null;
}
