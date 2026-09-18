const {api,depts}=require('../../utils/view');
Page({
  onPullDownRefresh(){wx.stopPullDownRefresh()},
  data:{mode:'login',depts,deptIndex:0,username:'',password:'',confirm:'',name:'',invite:'',resetToken:'',busy:false,pending:false,error:'',cloud:false},
  onLoad(options){
    const invite=options.invite||'';
    const reset=options.reset||'';
    this.setData({
      invite,
      resetToken:reset,
      mode:invite?'register':reset?'recover':'login',
      cloud:api.config().transport==='cloud',
      pending:false
    });
  },
  onShow(){
    this.setData({pending:false});
    const t=api.token();
    if(!t)return;
    api.call('info').then(info=>{
      if(info && info.user && info.user.status==='active'){
        wx.switchTab({url:'/pages/home/index'});
      }else{
        api.clear();
      }
    }).catch(()=>{});
  },
  input(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value})},
  dept(e){this.setData({deptIndex:Number(e.detail.value)})},
  mode(e){this.setData({mode:e.currentTarget.dataset.mode,error:'',pending:false})},
  async submit(){
    if(this.data.busy)return;
    this.setData({busy:true,error:''});
    try{
      const d=this.data;
      if(d.mode!=='login' && d.password!==d.confirm) throw Error('两次密码不一致');
      const data=d.mode==='recover'
        ? {token:d.resetToken,password:d.password}
        : {username:d.username,password:d.password,name:d.name,dept:depts[d.deptIndex],invite:d.invite};
      await api.call(d.mode,data);
      if(d.mode==='recover'){
        this.setData({mode:'login',password:'',confirm:''});
        wx.showToast({title:'密码已更新',icon:'success'});
        return;
      }
      const info=await api.call('info');
      if(info && info.user && info.user.status==='active'){
        await api.refresh(true);
        wx.switchTab({url:'/pages/home/index'});
      }else{
        this.setData({pending:true,pendingName:(info&&info.user&&info.user.name)||''});
      }
    }catch(e){
      this.setData({error:e.message||'操作失败'});
    }finally{
      this.setData({busy:false});
    }
  },
  async wechat(){
    if(this.data.busy)return;
    this.setData({busy:true,error:''});
    try{
      await api.call('wechat/login',{});
      await api.refresh(true);
      wx.switchTab({url:'/pages/home/index'});
    }catch(e){
      this.setData({error:e.message||'微信登录失败'});
    }finally{
      this.setData({busy:false});
    }
  },
  async check(){
    try{
      const info=await api.call('info');
      if(info && info.user && info.user.status==='active'){
        await api.refresh(true);
        wx.switchTab({url:'/pages/home/index'});
      }else{
        wx.showToast({title:'尚未开通',icon:'none'});
      }
    }catch(e){
      wx.showToast({title:e.message||'检查失败',icon:'none'});
    }
  },
  logout(){
    api.clear();
    this.setData({pending:false,mode:'login',error:''});
  },
  connection(){
    wx.navigateTo({url:'/pages/connection/index'});
  }
});
