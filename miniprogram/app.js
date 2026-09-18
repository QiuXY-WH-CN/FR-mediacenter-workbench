const api=require('./services/api');
App({
  onLaunch(){this.startPolling();},
  onShow(){this.stopPolling();this.startPolling();if(api.token())api.refresh().catch(()=>{});},
  onHide(){this.stopPolling();},
  startPolling(){if(this.timer)return;this.timer=setInterval(()=>{if(api.token())api.refresh().catch(()=>{})},api.config().pollMs);},
  stopPolling(){if(this.timer)clearInterval(this.timer);this.timer=null;}
});
