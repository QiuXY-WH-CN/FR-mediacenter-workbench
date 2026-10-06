// Department events are private to their department and explicitly assigned participants.
export function visibleWorkspace(s,u,workspace='') {
 const tasks=(s.tasks||[]).filter(t=>u.role==='admin'||t.owner===u.id||t.receiver===u.id||u.role==='manager'&&t.dept===u.dept||(s.events||[]).some(e=>e.id===t.event&&e.createdBy===u.id));
 const accessible=(s.events||[]).filter(e=>!e.department||u.role==='admin'||e.department===u.dept||e.createdBy===u.id||tasks.some(t=>t.event===e.id));
 const scoped=workspace?tasks.filter(t=>t.dept===workspace):tasks;
 const events=workspace?accessible.filter(e=>e.department===workspace||scoped.some(t=>t.event===e.id)):accessible;
 const hiddenNames=[...(s.events||[]).filter(e=>!accessible.includes(e)).map(e=>e.name),...(s.tasks||[]).filter(t=>!tasks.includes(t)).map(t=>t.name)].filter(Boolean);
 const visibleNames=new Set([...accessible.map(e=>e.name),...tasks.map(t=>t.name),...(s.templates||[]).map(t=>t.name)]);
 const notices=(s.notices||[]).filter(n=>{
  if(n.target!=='all'&&n.target!==u.id)return false;
  if(u.role==='admin')return true;
  if(n.department&&n.department!==u.dept)return false;
  if(hiddenNames.some(name=>n.text?.includes('「'+name+'」')))return false;
  // Older deleted events have no audience metadata. Unknown quoted names stay private.
  return n.department!==undefined||[...(n.text||'').matchAll(/「([^」]+)」/g)].every(m=>visibleNames.has(m[1]));
 });
 return {events,tasks:scoped,notices};
}
