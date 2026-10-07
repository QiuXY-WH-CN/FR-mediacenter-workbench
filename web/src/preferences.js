import bcrypt from 'bcryptjs';
import ParticleEngine from '../../miniprogram/utils/particle-engine.js';
export const defaults={workspace:'',themeColor:'#e77b24',appearance:'light',particles:'constellation',particleDensity:48,rotationMinutes:5,motion:true,language:'zh-CN',fontScale:1,particleSystem:{...ParticleEngine.defaults}};
export async function ensurePreferences(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS member_preferences (user TEXT PRIMARY KEY,data TEXT NOT NULL)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS account_requests (user TEXT PRIMARY KEY,reason TEXT NOT NULL,status TEXT NOT NULL,requested INTEGER NOT NULL,revision INTEGER NOT NULL,review_note TEXT NOT NULL DEFAULT '')").run();
}
export async function readPreferences(db,u){const row=await db.prepare('SELECT data FROM member_preferences WHERE user=?').bind(u.id).first();const stored=row?JSON.parse(row.data):{};return {...Object.fromEntries(Object.keys(defaults).map(k=>[k,stored[k]??defaults[k]])),particleSystem:ParticleEngine.normalize(stored.particleSystem||{}),fontScale:Number.isFinite(stored.fontScale)?Math.max(.85,Math.min(1.35,stored.fontScale)):1}}
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
  await db.prepare('INSERT INTO member_preferences (user,data) VALUES (?,?) ON CONFLICT(user) DO UPDATE SET data=excluded.data').bind(u.id,JSON.stringify(data)).run();return {ok:true,settings:data};
 }
 if(path==='/api/account/request'){
  if(u.owner)fail(403,'初始管理员请先联系项目维护者完成负责人移交，再申请注销');
  if(typeof b.password!=='string'||!await bcrypt.compare(b.password,u.password))fail(400,'当前密码不正确');
  const reason=text(b.reason,500);
  await db.prepare("INSERT INTO account_requests (user,reason,status,requested,revision) VALUES (?,?,'pending',?,1) ON CONFLICT(user) DO UPDATE SET reason=excluded.reason,status='pending',requested=excluded.requested,revision=revision+1,review_note=''").bind(u.id,reason,Date.now()).run();return {ok:true};
 }
 if(path==='/api/account/cancel'){await db.prepare("UPDATE account_requests SET status='cancelled' WHERE user=? AND status='pending'").bind(u.id).run();return {ok:true}}
 if(path==='/api/account/review'){
  if(u.role!=='admin')fail(403,'只有管理员可以审核注销申请');
  const request=await db.prepare("SELECT account_requests.*,users.owner FROM account_requests JOIN users ON users.id=account_requests.user WHERE user=? AND revision=? AND account_requests.status='pending'").bind(text(b.id),Number(b.revision)).first();
  if(!request)fail(409,'申请已变更，请刷新');if(request.owner||request.user===u.id)fail(403,'不能注销此账号');
  if(!['approve','reject'].includes(b.action))fail(400,'审核操作无效');
  if(b.action==='approve'){
   const row=await db.prepare('SELECT data FROM workspace WHERE id=1').first(),s=row?JSON.parse(row.data):{tasks:[]};
   if(s.tasks.some(t=>t.status!=='done'&&(t.owner===request.user||t.receiver===request.user)))fail(409,'该成员有未完成的负责或验收任务，请先完成交接');
   await db.batch([db.prepare("UPDATE users SET status='disabled',name='已注销成员',username=?,role='member' WHERE id=? AND EXISTS (SELECT 1 FROM account_requests WHERE user=? AND revision=? AND status='pending')").bind('closed-'+request.user,request.user,request.user,request.revision),db.prepare('DELETE FROM sessions WHERE user=?').bind(request.user),db.prepare('DELETE FROM member_profiles WHERE user=?').bind(request.user),db.prepare('DELETE FROM member_preferences WHERE user=?').bind(request.user),db.prepare("UPDATE account_requests SET status='approved',review_note=? WHERE user=? AND revision=? AND status='pending'").bind(b.note?text(b.note,300):'',request.user,request.revision)]);
  }else await db.prepare("UPDATE account_requests SET status='rejected',review_note=? WHERE user=? AND revision=? AND status='pending'").bind(b.note?text(b.note,300):'',request.user,request.revision).run();
  return {ok:true};
 }
 return null;
}
