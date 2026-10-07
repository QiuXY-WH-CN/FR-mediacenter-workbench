// Adaptive CAPTCHA and cooldown UX. Password submissions are never retried automatically.
(()=>{
 let current=null,epoch=0,timer=0;
 const text=(zh,en)=>uiLanguage()==='en'?en:zh;
 function form(){return document.querySelector('#auth-form')}
 function stop(){clearInterval(timer);timer=0;current=null;epoch++}
 function status(){const f=form();if(!f||authMode!=='login'||!current)return;const seconds=Math.max(0,Math.ceil((current.until-Date.now())/1000)),button=f.querySelector('[type=submit]'),hint=f.querySelector('[data-login-status]');
  if(hint)hint.textContent=current.locked?text('密码错误已达 10 次。请联系管理员获取重置链接。','10 incorrect passwords. Contact an administrator for a reset link.'):seconds?text(`冷却中，请 ${seconds} 秒后重试。`,`Please wait ${seconds} seconds before trying again.`):current.required?text('请输入图片中的 5 位验证码；点击图片可换一张。','Enter the 5 characters. Click the image for a new challenge.') :'';
  if(button&&!busy){button.disabled=!!(current.locked||seconds);button.textContent=seconds?text(`请等待 ${seconds} 秒`,`Wait ${seconds}s`):text('登录','Sign in')}
 }
 function update(meta){const f=form();if(!f||authMode!=='login')return;if(!current)current={until:0,required:false,locked:false,username:f.elements.username.value.trim().toLowerCase()};
  if(Number.isFinite(meta.retryAfter))current.until=Date.now()+Math.max(0,meta.retryAfter)*1000;
  if(typeof meta.locked==='boolean')current.locked=meta.locked;
  if(typeof meta.required==='boolean'||typeof meta.captchaRequired==='boolean')current.required=!!(meta.required??meta.captchaRequired);
  const group=f.querySelector('[data-login-captcha]');group.hidden=!current.required||current.locked;
  const answer=f.elements.captchaAnswer;answer.required=current.required&&!current.locked;
  if(meta.id&&meta.image?.startsWith('data:image/png;base64,')){f.elements.captchaId.value=meta.id;f.querySelector('[data-captcha-image]').src=meta.image;answer.value=''}status();if(!timer)timer=setInterval(status,500);
 }
 async function challenge(){const f=form();if(!f||authMode!=='login')return;const username=f.elements.username.value.trim().toLowerCase();if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username))return;
  const serial=++epoch;try{const meta=await priorApi('captcha',{username});if(serial!==epoch||f!==form()||username!==f.elements.username.value.trim().toLowerCase())return;current={username,until:0,required:false,locked:false};update(meta)}catch{if(serial===epoch&&f===form()){const hint=f.querySelector('[data-login-status]');if(hint)hint.textContent=text('验证码暂未读取，请点击图片重试。','Challenge unavailable. Click the image to try again.')}}
 }
 const priorAuth=auth;auth=function(...args){stop();priorAuth(...args);const f=form();if(authMode!=='login'||!f)return;const box=document.createElement('div');box.className='login-security';box.innerHTML=`<div data-login-captcha hidden><label class="field">${text('验证码','Verification code')}<input name="captchaAnswer" maxlength="5" pattern="[A-Za-z2-9]{5}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="${text('验证码','Verification code')}"></label><button type="button" class="captcha-refresh" data-refresh-captcha aria-label="${text('刷新验证码','Refresh verification code')}"><img data-captcha-image alt="${text('图形验证码','Visual verification code')}"><span>${text('换一张','Refresh')}</span></button><input name="captchaId" type="hidden"></div><p class="sub" data-login-status role="status"></p>`;f.querySelector('[type=submit]').before(box);f.elements.username.addEventListener('blur',challenge);f.elements.username.addEventListener('input',()=>{stop();f.elements.captchaId.value='';f.elements.captchaAnswer.value='';f.elements.captchaAnswer.required=false;f.querySelector('[data-login-captcha]').hidden=true;f.querySelector('[data-login-status]').textContent='';const button=f.querySelector('[type=submit]');if(!busy)button.disabled=false});f.querySelector('[data-refresh-captcha]').addEventListener('click',challenge)};
 const priorApi=api;api=async function(path,data){try{return await priorApi(path,data)}catch(e){if(path==='login'&&form()&&authMode==='login'){update(e);if(e.captchaRequired&&!e.locked)await challenge();if(uiLanguage()==='en'){e.message=({PASSWORD_LOCKED:'Account locked after 10 incorrect passwords. Contact an administrator.',PASSWORD_COOLDOWN:'Incorrect password. Wait for the cooldown before trying again.',CAPTCHA_REJECTED:'Invalid or expired verification code. Refresh the image.',LOGIN_REJECTED:'Incorrect username or password.',LOGIN_CHANGED:'Login state changed. Please try again.'})[e.code]||e.message}}throw e}};
 document.addEventListener('submit',e=>{if(e.target.id!=='auth-form'||authMode!=='login'||!current)return;if(current.locked||current.until>Date.now()){e.preventDefault();e.stopImmediatePropagation();status()}},true);
 window.addEventListener('pagehide',stop);
})();
