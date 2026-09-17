const api=require('./services/api');
const DEV_ADMIN_TOKEN='3f936e4d7318d28beddf34b2d314c61e9ed9a9dc91c3da96c9af33881f6be630';
App({
  onLaunch(){
    // 开发预览：首次启动自动预登录管理员，便于直接进入工作台验证。
    // 退出登录后不会再次自动注入，后续正常显示登录页。
    if(!wx.getStorageSync('fr.autoAdminDone') && !wx.getStorageSync('fr.token')){
      wx.setStorageSync('fr.token',DEV_ADMIN_TOKEN);
      wx.setStorageSync('fr.autoAdminDone',true);
    }
    this.startPolling();
  },
  onShow(){this.stopPolling();this.startPolling();if(api.token())api.refresh().catch(()=>{});},
  onHide(){this.stopPolling();},
  startPolling(){if(this.timer)return;this.timer=setInterval(()=>{if(api.token())api.refresh().catch(()=>{})},api.config().pollMs);},
  stopPolling(){if(this.timer)clearInterval(this.timer);this.timer=null;}
});
