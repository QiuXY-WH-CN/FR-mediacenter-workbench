const api=require('./services/api'),R=require('./utils/recovery');
const singlePage=options=>Number(options?.scene||wx.getLaunchOptionsSync?.().scene)===1154;
App({
 onLaunch(options){this.publicPreview=singlePage(options);if(this.publicPreview)return;try{R.bootRepair()}catch(error){R.capture(error,'schema')}this.applyAuthQuery(options);this.hydrate()},
 onShow(options){this.publicPreview=singlePage(options);if(this.publicPreview){this.stopPolling();return}this.applyAuthQuery(options);this.startPolling();if(api.token())api.refresh().catch(()=>{})},
 onHide(){this.stopPolling()},
 onError(error){R.capture(error,'runtime')},
 onUnhandledRejection(event){R.capture(event?.reason,'promise')},
 onPageNotFound(){R.capture(null,'render');R.noteRecovery('restart');try{wx.reLaunch({url:api.token()?'/pages/home/index':'/pages/auth/index'})}catch(error){R.capture(error,'render')}},
 applyAuthQuery(options){const query=options?.query||{};if(query.invite||query.reset||query.setup)this.pendingAuth={invite:typeof query.invite==='string'?query.invite:'',reset:typeof query.reset==='string'?query.reset:'',setup:typeof query.setup==='string'?query.setup:''}},
 hydrate(){if(!api.token())return;api.call('info').then(info=>{if(info?.user?.status==='active')api.refresh(true).catch(()=>{});else api.clear()}).catch(()=>{})},
 startPolling(){if(this.timer)return;try{this.timer=setInterval(()=>{if(api.token())api.refresh().catch(()=>{})},api.config().pollMs)}catch(error){R.capture(error,'runtime');this.timer=null}},
 stopPolling(){if(this.timer)clearInterval(this.timer);this.timer=null}
});
