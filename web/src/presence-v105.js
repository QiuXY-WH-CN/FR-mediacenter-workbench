// Presence is ephemeral: no login persistence, account identifiers or last-seen data are stored.
(()=>{
 const heartbeatMs=25000,client=typeof crypto?.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
 let account='',epoch=0,seq=0,timer=0,lastSent=0,lastRead=0,announced=false,suspended=false,reading=false;
 const requests=new Set(),foreground=()=>!suspended&&!document.hidden&&navigator.onLine!==false;
 function cancelTimer(){clearInterval(timer);timer=0}
 function reset(){epoch++;account='';announced=false;lastSent=lastRead=0;reading=false;cancelTimer();for(const c of requests)c.abort();requests.clear()}
 function redrawStatuses(){
  const heading=document.querySelector('.account-heading>div');if(user&&heading&&!heading.querySelector('[data-presence-id]'))heading.insertAdjacentHTML('beforeend',presenceMarkup(user));
  const people=new Map([...(state?.people||[]),...members,...(user?[user]:[])].map(p=>[p.id,p]));
  for(const el of document.querySelectorAll('[data-presence-id]')){const p=people.get(el.dataset.presenceId),online=p?.status==='active'&&p.online===true;el.dataset.online=String(online);el.classList.toggle('is-online',online);el.classList.toggle('is-offline',!online);const text=el.querySelector('span');if(text)text.textContent=orgWords(online?'在线':'离线',online?'Online':'Offline')}
 }
 async function readMembers(requestEpoch,identity){
  if(reading||view!=='members'||Date.now()-lastRead<heartbeatMs)return;reading=true;lastRead=Date.now();
  try{
   const result=await api('members');if(requestEpoch!==epoch||user?.id!==identity||!foreground()||view!=='members'||!Array.isArray(result.members))return;
   const next=result.members,prior=new Map(members.map(p=>[p.id,p])),changed=next.length!==members.length||next.some(p=>{const old=prior.get(p.id);return !old||['name','avatar','dept','role','status','owner'].some(k=>old[k]!==p[k])});
   members=next;const statuses=new Map(next.map(p=>[p.id,p.online===true]));for(const p of state.people||[])if(statuses.has(p.id))p.online=statuses.get(p.id);
   if(orgScene&&orgScene.account===identity)for(const n of orgScene.nodes)if(n.kind==='person'){const p=next.find(p=>p.id===n.person.id);if(p)n.person=p}
   const panel=document.querySelector('.member-profile-portal'),selected=panel?.dataset.presenceMember;if(selected&&!next.some(p=>p.id===selected)){personPinned='';panel.remove()}
   if(changed)render();else redrawStatuses();
  }catch{}finally{if(requestEpoch===epoch)reading=false}
 }
 async function send(active){
  if(!account||user?.id!==account||user.status!=='active'||active&&(!foreground()||window.WorkbenchRecovery?.isReadOnly?.()))return;
  const identity=account,requestEpoch=epoch,requestSequence=++seq,controller=new AbortController();requests.add(controller);const timeout=setTimeout(()=>controller.abort(),6000);if(active){lastSent=Date.now();announced=true}else announced=false;
  try{
   const response=await fetch('/api/presence',{method:'POST',credentials:'same-origin',keepalive:!active,signal:controller.signal,headers:{'Content-Type':'application/json','X-FR-Request':'1'},body:JSON.stringify({active,client,seq:requestSequence})});
   if(requestEpoch!==epoch||user?.id!==identity)return;
   if(!response.ok){if([401,403].includes(response.status))await api('state').catch(()=>{});return}
   if(active&&!foreground()){if(requestSequence===seq)await send(false);return}
   if(active){user.online=true;redrawStatuses();await readMembers(requestEpoch,identity)}
  }catch{}finally{clearTimeout(timeout);requests.delete(controller)}
 }
 function deactivate(){cancelTimer();if(announced)send(false)}
 function sync(force=false){
  const identity=user?.status==='active'?user.id:'';if(identity!==account){reset();account=identity}if(!account)return;
  if(!foreground()){deactivate();return}if(!timer)timer=setInterval(()=>sync(),heartbeatMs);
  if(force||!lastSent||Date.now()-lastSent>=heartbeatMs)send(true);
 }
 const priorRender=render;render=function(...args){priorRender(...args);redrawStatuses();sync()};
 const priorAuth=auth;auth=function(...args){reset();priorAuth(...args)};
 document.addEventListener('visibilitychange',()=>document.hidden?deactivate():sync(true));
 window.addEventListener('pagehide',()=>{suspended=true;deactivate()});window.addEventListener('pageshow',()=>{suspended=false;sync(true)});
 window.addEventListener('offline',deactivate);window.addEventListener('online',()=>sync(true));sync();
})();
