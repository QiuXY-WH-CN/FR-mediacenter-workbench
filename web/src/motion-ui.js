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
 const body=`<button class="secondary" data-profile>更改姓名 / 头像</button> <button class="secondary" data-password>修改密码</button><p class="hint">姓名与头像修改需管理员审核。</p><button class="secondary" data-switch-account>更换账号</button> <button class="secondary" data-logout>退出登录</button><hr><h3>注销账号申请</h3>${state.accountRequest?.status==='pending'?'<p>申请已提交，等待管理员审核与工作交接。</p><button class="secondary" data-cancel-account>撤回申请</button>':`<form id="closure-form"><label class="field">申请原因<textarea name="reason" required maxlength="500"></textarea></label><label class="field">当前密码<input type="password" name="password" required autocomplete="current-password"></label><button class="secondary" type="submit">提交注销申请</button></form>`}`;
 modal('设置',tabs+body);
}
const fxApi=api;api=async(path,data)=>{if(path==='settings/save'&&data?.language)localStorage.setItem('fr.language',data.language);return fxApi(path,data)};
function closeContextPanels(){accountPinned=false;personPinned='';document.querySelectorAll('.account-dock.pinned,.person-bubble.pinned').forEach(el=>el.classList.remove('pinned'));const dock=$('.account-dock');dock?.classList.add('dismissed');dock?.querySelector('[data-account]')?.setAttribute('aria-expanded','false');$('.member-profile-portal')?.remove()}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.account-dock,.person-bubble,.member-profile-portal'))closeContextPanels()});
document.addEventListener('pointerover',e=>{if(e.target.closest('.account-dock'))$('.account-dock')?.classList.remove('dismissed')});
document.addEventListener('focusin',e=>{if(e.target.closest('.account-dock'))$('.account-dock')?.classList.remove('dismissed')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeContextPanels()});
let fxPreviousView='',fxPreviousMotion;
const fxRender=render;render=()=>{fxRender();const side=$('.side-bottom'),dock=$('.account-dock');if(side&&dock){side.replaceChildren(dock)}const main=$('main');if(main){main.dataset.enter=String(fxPreviousView!==view);main.querySelectorAll('.panel,.stat,.activity-card').forEach((el,i)=>el.style.setProperty('--reveal-order',Math.min(i,6)));fxPreviousView=view}localizeInterface();if(personPinned&&view==='members')memberPreview(personPinned)};
function applyTheme(){const p=prefs(),r=document.documentElement,c=p.themeColor||'#e77b24';r.style.setProperty('--accent',c);r.style.setProperty('--green',c);r.style.setProperty('--light',`color-mix(in srgb, ${c} 10%, var(--surface))`);r.dataset.dark=String(p.appearance==='dark'||p.appearance==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);r.dataset.motion=String(p.motion!==false);}
// Ambient particles are independent of the organization scene.
function stopParticles(){cancelAnimationFrame(particleFrame);particleController?.stop();particleController=null;particleCanvas?.remove();particleCanvas=null;particleSignature=''}
function startParticles(){
 const p=prefs(),sig=JSON.stringify(p)+document.documentElement.dataset.motion;
 if(sig===particleSignature&&particleCanvas)return;stopParticles();particleSignature=sig;
 if(document.documentElement.dataset.motion==='false')return;
 if(p.particles!=='off'){
  const canvas=document.createElement('canvas');canvas.className='particle-canvas';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);particleCanvas=canvas;particleController=createParticleController(canvas,p);
 }
}
document.addEventListener('pointerdown',e=>{const target=e.target.closest('button,.task-row,.flow-step,nav a');if(!target||document.documentElement.dataset.motion==='false')return;target.animate([{filter:'brightness(1)',transform:'scale(1)'},{filter:'brightness(1.1)',transform:'scale(.97)'},{filter:'brightness(1)',transform:'scale(1)'}],{duration:260,easing:'ease-out'})});
