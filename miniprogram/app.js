const api=require('./services/api'),R=require('./utils/recovery');
const singlePage=options=>Number(options?.scene||wx.getLaunchOptionsSync?.().scene)===1154;
App({
 onLaunch(options){this.publicPreview=singlePage(options);if(this.publicPreview)return;this.foreground=true;this.installPresence();try{R.bootRepair()}catch(error){R.capture(error,'schema')}this.applyAuthQuery(options);this.hydrate()},
 onShow(options){this.publicPreview=singlePage(options);if(this.publicPreview){this.foreground=false;this.stopPolling();return}this.foreground=true;this.installPresence();this.applyAuthQuery(options);this.startPolling();this.sendPresence(true);if(api.token())api.refresh().catch(()=>{})},
 onHide(){if(!this.publicPreview)this.sendPresence(false);this.foreground=false;this.stopPolling()},
 onError(error){R.capture(error,'runtime')},
 onUnhandledRejection(event){R.capture(event?.reason,'promise')},
 onPageNotFound(){R.capture(null,'render');if(this.publicPreview)return;R.noteRecovery('restart');try{wx.reLaunch({url:api.token()?'/pages/home/index':'/pages/auth/index'})}catch(error){R.capture(error,'render')}},
 applyAuthQuery(options){const query=options?.query||{};if(query.invite||query.reset||query.setup)this.pendingAuth={invite:typeof query.invite==='string'?query.invite:'',reset:typeof query.reset==='string'?query.reset:'',setup:typeof query.setup==='string'?query.setup:''}},
 hydrate(){if(this.publicPreview||!api.token())return;api.call('info').then(info=>{if(info?.user?.status==='active')api.refresh(true).catch(()=>{});else api.clear()}).catch(()=>{})},
 installPresence(){if(this.presenceUnsubscribe)return;this.presenceClient='mini_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,14);this.presenceSeq=0;this.presenceUnsubscribe=api.subscribe(s=>{if(s&&this.foreground&&!this.publicPreview&&Date.now()-(this.lastPresence||0)>20000)this.sendPresence(true)})},
 sendPresence(active){if(this.publicPreview||!api.token())return;this.installPresence();this.lastPresence=Date.now();api.call('presence',{active,client:this.presenceClient,seq:++this.presenceSeq}).then(result=>{const snapshot=api.getState();if(active&&this.foreground&&!this.publicPreview&&snapshot&&snapshot.user.online!==result?.online)api.refresh().catch(()=>{})}).catch(()=>{})},
 startPolling(){if(this.publicPreview)return;if(!this.presenceTimer)this.presenceTimer=setInterval(()=>{if(this.foreground&&!this.publicPreview)this.sendPresence(true)},25000);if(this.timer)return;try{this.timer=setInterval(()=>{if(api.token())api.refresh().catch(()=>{})},api.config().pollMs)}catch(error){R.capture(error,'runtime');this.timer=null}},
 stopPolling(){if(this.timer)clearInterval(this.timer);this.timer=null;if(this.presenceTimer)clearInterval(this.presenceTimer);this.presenceTimer=null}
});
