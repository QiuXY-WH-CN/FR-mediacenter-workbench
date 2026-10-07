// Shared ambient motion, neutral themes and bilingual interface.
const uiLanguage=()=>prefs().language||localStorage.getItem('fr.language')||'zh-CN';
const uiText=s=>Localization.translate(s,uiLanguage());
const fxTextSource=new WeakMap(),fxAttributeSource=new WeakMap();
function localizeInterface(root=document.body){
 const lang=uiLanguage();document.documentElement.lang=lang;document.title=lang==='en'?'Fengru Media · Workspace':'冯如学媒 · 协作工作台';
 const content=new Set([user?.name,user?.username,...state.people.map(p=>p.name),...state.events.flatMap(e=>[e.name,e.description,e.location]),...state.tasks.flatMap(t=>[t.name,t.requirements,t.submission,t.feedback]),...(state.templates||[]).filter(t=>t.createdBy).flatMap(t=>[t.name,t.description,...t.steps.flatMap(s=>[s.name,s.requirements])])].filter(Boolean));
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode()){
  if(node.parentElement?.closest('script,style,textarea,.sop-reader,.sop-document small,.detail-copy,.person-home,[data-original-content],.brand,[data-brand-name]'))continue;
  const prior=fxTextSource.get(node),source=prior&&node.textContent===prior.output?prior.source:node.textContent;
  if(source.trim()==='冯如学媒'||content.has(source.trim())&&!node.parentElement.closest('option'))continue;
  const output=Localization.translate(source,lang);fxTextSource.set(node,{source,output});if(node.textContent!==output)node.textContent=output;
 }
 for(const el of root.querySelectorAll('[placeholder],[aria-label],[title]')){const old=fxAttributeSource.get(el)||{};for(const k of ['placeholder','aria-label','title'])if(el.hasAttribute(k)){const value=el.getAttribute(k),source=old[k]?.output===value?old[k].source:value,output=Localization.translate(source,lang);old[k]={source,output};if(value!==output)el.setAttribute(k,output)}fxAttributeSource.set(el,old)}
}
let fxLocalizationQueued=false;
new MutationObserver(()=>{if(fxLocalizationQueued)return;fxLocalizationQueued=true;queueMicrotask(()=>{fxLocalizationQueued=false;localizeInterface()})}).observe(document.body,{childList:true,subtree:true});
const fxToast=toast;toast=s=>fxToast(uiText(s));
const fxModal=modal;modal=(...args)=>{fxModal(...args);localizeInterface($('#dialog-body'))};
// Account form is shared with the extended appearance/general settings module.
function settingsForm(tab='account'){
 if(tab!=='account')return;
 const tabs=`<div class="settings-tabs">${[['general','通用'],['appearance','外观'],['account','账号与安全']].map(([id,label])=>`<button class="${tab===id?'primary':'secondary'}" data-settings-tab="${id}">${label}</button>`).join('')}</div>`;
 const body=`<button class="secondary" data-profile>更改姓名 / 头像</button> <button class="secondary" data-password>修改密码</button><p class="hint">姓名与头像提交后经管理员审核，同步到各设备。</p><button class="secondary" data-switch-account>更换账号</button> <button class="secondary" data-logout>退出登录</button><hr><h3>注销账号申请</h3>${state.accountRequest?.status==='pending'?'<p>申请已提交，等待管理员审核与工作交接。</p><button class="secondary" data-cancel-account>撤回申请</button>':`<form id="closure-form"><label class="field">申请原因<textarea name="reason" required maxlength="500"></textarea></label><label class="field">当前密码<input type="password" name="password" required autocomplete="current-password"></label><button class="secondary" type="submit">提交注销申请</button></form>`}`;
 modal('设置',tabs+body);
}
const fxApi=api;api=async(path,data)=>{if(path==='settings/save'&&data?.language)localStorage.setItem('fr.language',data.language);return fxApi(path,data)};
function closeContextPanels(){accountPinned=false;personPinned='';document.querySelectorAll('.account-dock.pinned,.person-bubble.pinned').forEach(el=>el.classList.remove('pinned'));const dock=$('.account-dock');dock?.classList.add('dismissed');dock?.querySelector('[data-account]')?.setAttribute('aria-expanded','false');$('.member-profile-portal')?.remove()}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.account-dock,.person-bubble,.member-profile-portal'))closeContextPanels()});
document.addEventListener('pointerover',e=>{if(e.target.closest('.account-dock'))$('.account-dock')?.classList.remove('dismissed')});
document.addEventListener('focusin',e=>{if(e.target.closest('.account-dock'))$('.account-dock')?.classList.remove('dismissed')});
document.addEventListener('contextmenu',e=>{const b=e.target.closest('[data-person]');if(b){e.preventDefault();personPinned=b.dataset.person;memberPreview(personPinned);b.closest('.person-bubble').classList.add('pinned')}});
document.addEventListener('click',e=>{if(e.target.closest('[data-person]')){if(personPinned)memberPreview(personPinned);else $('.member-profile-portal')?.remove()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeContextPanels()});
const fxOrg=organizationGraph;organizationGraph=()=>fxOrg().replace('学媒协作星图','组织架构图').replace('<p class="sub">拖动部门气泡调整位置；点击展开成员；悬停查看主页，点击固定。</p>','').replace('<div class="aero-map">','<div class="aero-map"><canvas class="org-particles" aria-hidden="true"></canvas>');
let fxPreviousView='',fxPreviousMotion;
const fxRender=render;render=()=>{fxRender();const side=$('.side-bottom'),dock=$('.account-dock');if(side&&dock){side.replaceChildren(dock)}const main=$('main');if(main){main.dataset.enter=String(fxPreviousView!==view);main.querySelectorAll('.panel,.stat,.activity-card').forEach((el,i)=>el.style.setProperty('--reveal-order',Math.min(i,6)));fxPreviousView=view}localizeInterface();if(personPinned&&view==='members')memberPreview(personPinned)};
function applyTheme(){const p=prefs(),r=document.documentElement,c=p.themeColor||'#e77b24';r.style.setProperty('--accent',c);r.style.setProperty('--green',c);r.style.setProperty('--light',`color-mix(in srgb, ${c} 10%, var(--surface))`);r.dataset.dark=String(p.appearance==='dark'||p.appearance==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);r.dataset.motion=String(p.motion!==false);}
// Shared particle forces and organization springs use separate animation lifecycles.
let fxOrgFrame=0,fxOrgDragAnchor;
const fxOrgPhysics=new Map(),fxOrgHeld=new Set();
function stopParticles(){cancelAnimationFrame(particleFrame);cancelAnimationFrame(fxOrgFrame);particleController?.stop();particleController=null;particleCanvas?.remove();particleCanvas=null;particleSignature=''}
function startParticles(){
 const p=prefs(),sig=JSON.stringify(p)+document.documentElement.dataset.motion;
 if(sig===particleSignature&&particleCanvas){startOrganizationMotion();return}stopParticles();particleSignature=sig;
 if(document.documentElement.dataset.motion==='false'){document.querySelector('.org-particles')?.getContext('2d')?.clearRect(0,0,2000,2000);return}
 if(p.particles!=='off'){
  const canvas=document.createElement('canvas');canvas.className='particle-canvas';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);particleCanvas=canvas;particleController=createParticleController(canvas,p);
 }
 startOrganizationMotion();
}
// Pause exactly where the user points. The spring resumes from that position without a phase jump.
document.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-bubble-drag]');if(!b)return;const el=b.parentElement,dept=b.dataset.bubbleDrag;fxOrgHeld.add(dept);fxOrgDragAnchor={b,dept,x:e.clientX,y:e.clientY,left:parseFloat(el.style.left),top:parseFloat(el.style.top),rect:el.closest('.aero-map').getBoundingClientRect()}});
document.addEventListener('pointermove',e=>{const a=fxOrgDragAnchor;if(!a||!bubbleDrag?.moved)return;const x=Math.max(15,Math.min(85,a.left+(e.clientX-a.x)/a.rect.width*100)),y=Math.max(15,Math.min(85,a.top+(e.clientY-a.y)/a.rect.height*100));bubblePositions.set(a.dept,[x,y]);a.b.parentElement.style.left=x+'%';a.b.parentElement.style.top=y+'%';const s=fxOrgPhysics.get(a.dept);if(s){s.x=x;s.y=y;s.vx=s.vy=0;s.base=[x,y]}const line=[...a.b.closest('.aero-map').querySelectorAll('[data-line]')].find(l=>l.dataset.line===a.dept);line?.setAttribute('x2',x);line?.setAttribute('y2',y)});
for(const event of ['pointerup','pointercancel'])document.addEventListener(event,()=>{fxOrgHeld.clear();fxOrgDragAnchor=undefined});
function startOrganizationMotion(){
 cancelAnimationFrame(fxOrgFrame);const map=$('.aero-map');if(!map||document.documentElement.dataset.motion==='false')return;const canvas=map.querySelector('.org-particles'),ctx=canvas.getContext('2d'),orgSystem=ParticleEngine.create({width:map.clientWidth,height:map.clientHeight,count:Math.min(48,prefs().particleDensity||48),settings:prefs().particleSystem}),clusters=[...map.querySelectorAll('.aero-cluster')].map((el,i)=>{const b=el.querySelector('[data-bubble-drag]'),dept=b.dataset.bubbleDrag,base=bubblePositions.get(dept)||[[23,24],[77,24],[23,75],[77,75]][i];let s=fxOrgPhysics.get(dept);if(!s){s={x:base[0],y:base[1],vx:0,vy:0,phase:0,base:[...base]};fxOrgPhysics.set(dept,s)}el.style.left=s.x+'%';el.style.top=s.y+'%';return{el,b,dept,s,i,line:[...map.querySelectorAll('[data-line]')].find(l=>l.dataset.line===dept)}});let last=0,lastParticles=0;
 function frame(time){if(!map.isConnected)return;fxOrgFrame=requestAnimationFrame(frame);if(document.hidden){last=time;return}const dt=Math.min(.035,(time-last)/1000||1/60);last=time;const w=map.clientWidth,h=map.clientHeight;
  if(time-lastParticles>=33){const particleDt=lastParticles?Math.min(.065,(time-lastParticles)/1000):1/30;lastParticles=time;const dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ParticleEngine.resize(orgSystem,w,h)}if(prefs().particles!=='off'){const rect=canvas.getBoundingClientRect(),points=(particleController?.pointers||[]).map(p=>({x:p.x-rect.left,y:p.y-rect.top}));ParticleEngine.step(orgSystem,particleDt,points,prefs().themeColor);ParticleEngine.draw(ctx,orgSystem,particleCanvas?.dataset.style||'constellation')}else ctx.clearRect(0,0,w,h);canvas.dataset.frame=String(Math.floor(time));canvas.dataset.engine='physics'}
  for(const {el,dept,s,i,line}of clusters){const base=bubblePositions.get(dept)||[[23,24],[77,24],[23,75],[77,75]][i],held=el.matches(':hover,:focus-within')||fxOrgHeld.has(dept);el.dataset.held=String(held);if(held){s.x=parseFloat(el.style.left);s.y=parseFloat(el.style.top);s.vx=s.vy=0;s.base=[...base]}else{s.phase+=dt;const phase=s.phase+i*1.3,margin=Math.max(14,(el.clientWidth/2+12)/w*100),ax=Math.min(6.5,Math.max(2.5,(base[0]-margin)*.72),Math.max(2.5,(100-margin-base[0])*.72)),ay=8,tx=Math.max(margin,Math.min(100-margin,base[0]+Math.sin(phase*1.04)*ax+Math.sin(phase*1.73)*.7)),ty=Math.max(13,Math.min(87,base[1]+Math.cos(phase*.89)*ay+Math.sin(phase*1.48)*.9));const steps=Math.ceil(dt/(1/120)),step=dt/steps;for(let n=0;n<steps;n++){s.vx+=((tx-s.x)*38-s.vx*7.2)*step;s.vy+=((ty-s.y)*38-s.vy*7.2)*step;s.x+=s.vx*step;s.y+=s.vy*step}el.style.left=s.x.toFixed(4)+'%';el.style.top=s.y.toFixed(4)+'%'}line?.setAttribute('x2',s.x);line?.setAttribute('y2',s.y)}
 }fxOrgFrame=requestAnimationFrame(frame);
}
document.addEventListener('pointerdown',e=>{const target=e.target.closest('button,.task-row,.flow-step,nav a');if(!target||document.documentElement.dataset.motion==='false')return;target.animate([{filter:'brightness(1)',transform:'scale(1)'},{filter:'brightness(1.1)',transform:'scale(.97)'},{filter:'brightness(1)',transform:'scale(1)'}],{duration:260,easing:'ease-out'})});
