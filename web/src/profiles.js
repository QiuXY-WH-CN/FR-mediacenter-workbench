// Shared profile review and organization directory, used by both clients.
export async function ensureProfiles(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS member_profiles (user TEXT PRIMARY KEY, avatar TEXT NOT NULL DEFAULT '', pending_name TEXT, pending_avatar TEXT, requested INTEGER, revision INTEGER NOT NULL DEFAULT 0, review_status TEXT NOT NULL DEFAULT '', review_note TEXT NOT NULL DEFAULT '')").run();
}
export async function profileRoutes(path,b,u,db,{fail,text}) {
  if(path==='/api/profile/request') {
    const name=text(b.name,30),avatar=b.avatar||'';
    if(typeof avatar!=='string'||avatar.length>18000||avatar&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar))fail(400,'请上传压缩后的 PNG、JPEG 或 WebP 头像');
    const old=await db.prepare('SELECT * FROM member_profiles WHERE user=?').bind(u.id).first();
    if(name===u.name&&avatar===(old?.avatar||''))fail(400,'姓名和头像尚未修改');
    const result=await db.prepare("INSERT INTO member_profiles (user,pending_name,pending_avatar,requested,revision,review_status) SELECT ?,?,?,?,1,'pending' WHERE EXISTS (SELECT 1 FROM users WHERE id=? AND status='active') ON CONFLICT(user) DO UPDATE SET pending_name=excluded.pending_name,pending_avatar=excluded.pending_avatar,requested=excluded.requested,revision=revision+1,review_status='pending',review_note=''").bind(u.id,name,avatar,Date.now(),u.id).run();
    if(!result.meta.changes)fail(403,'账号已停用或权限已更新');
    return {ok:true};
  }
  if(path==='/api/profile/review') {
    if(u.role!=='admin')fail(403,'只有管理员可以审核姓名与头像');
    if(!['approve','reject'].includes(b.action)||!Number.isSafeInteger(b.revision))fail(400,'审核操作无效');
    const p=await db.prepare("SELECT * FROM member_profiles WHERE user=? AND revision=? AND review_status='pending'").bind(text(b.id),b.revision).first();
    if(!p)fail(409,'申请已更新或已审核，请刷新');
    const note=b.note?text(b.note,300):'';
    const authority="EXISTS (SELECT 1 FROM users WHERE id=? AND role='admin' AND status='active') AND EXISTS (SELECT 1 FROM users WHERE id=? AND status='active')",args=[u.id,p.user];
    if(b.action==='approve'){
      const results=await db.batch([
        db.prepare("UPDATE users SET name=? WHERE id=? AND EXISTS (SELECT 1 FROM member_profiles WHERE user=? AND revision=? AND review_status='pending') AND "+authority).bind(p.pending_name,p.user,p.user,b.revision,...args),
        db.prepare("UPDATE member_profiles SET avatar=pending_avatar,pending_name=NULL,pending_avatar=NULL,review_status='approved',review_note=? WHERE user=? AND revision=? AND review_status='pending' AND "+authority).bind(note,p.user,b.revision,...args)
      ]);
      if(!results[0].meta.changes||!results[1].meta.changes)fail(409,'申请或账号权限已更新，请刷新');
    }else{
      const result=await db.prepare("UPDATE member_profiles SET pending_name=NULL,pending_avatar=NULL,review_status='rejected',review_note=? WHERE user=? AND revision=? AND review_status='pending' AND "+authority).bind(note,p.user,b.revision,...args).run();
      if(!result.meta.changes)fail(409,'申请或账号权限已更新，请刷新');
    }
    return {ok:true};
  }
  return null;
}
