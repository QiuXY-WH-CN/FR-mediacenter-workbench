const Share=require('../../utils/sharing');
const { api, depts } = require('../../utils/view');
const UI=require('../../utils/interface');
const LoginMemory=require('../../utils/login-memory');

const COPY = {
  login: { title: '欢迎回到学媒', subtitle: '使用学媒账号登录。', submit: '登录' },
  register: { title: '注册学媒账号', subtitle: '填写信息后提交，由管理员审批开通。', submit: '提交申请' },
  setup: { title: '创建首位负责人账号', subtitle: '由你保管管理员账号，成员提交注册后由管理员审批，或通过邀请加入。', submit: '创建管理员账号' },
  reset: { title: '设置新密码', subtitle: '新密码生效后，原有登录会话将失效。', submit: '保存新密码' }
};

Page(Share.page({
  data: {
    ready: false,
    loading: true,
    busy: false,
    mode: 'login',
    title: COPY.login.title,
    subtitle: COPY.login.subtitle,
    submitText: COPY.login.submit,
    depts: depts,
    deptIndex: 0,
    dept: depts[0],
    username: '',
    name: '',
    password: '',
    confirm: '',
    invite: '',
    resetToken: '',
    setupToken: '',
    message: '',
    error: '',
    pending: false,
    pendingUser: null,
    pendingName: '',
    pendingDept: '',
    disabled: false,
    remember:false,secureMemory:false,memoryLoaded:false,reviewMode:false,
    captchaRequired:false,captchaId:'',captchaImage:'',captchaAnswer:'',cooldown:0,passwordLocked:false,securityHint:''
  },

  onLoad(options) {UI.install(this);
    this._securityEpoch=0;
    this._memoryEpoch=0;
    this.setData({secureMemory:LoginMemory.supported()});
    const app = getApp();
    const launch = (app && app.pendingAuth) || {};
    if (app) app.pendingAuth = {};
    this.setData({
      invite: options.invite || launch.invite || '',
      resetToken: options.reset || launch.reset || '',
      setupToken: options.setup || launch.setup || ''
    });
    this.bootstrap();
  },

  onPullDownRefresh() {
    wx.stopPullDownRefresh();
  },

  syncCopy() {
    const mode = this.data.mode;
    const copy = COPY[mode] || COPY.login;
    const subtitle = mode === 'register' && this.data.invite
      ? '已携带邀请码，注册成功后即可加入。'
      : copy.subtitle;
    this.setData({ title: copy.title, subtitle: subtitle, submitText: copy.submit });
  },

  async bootstrap() {
    this.syncCopy();
    try {
      const info = await api.call('info');
      this._memoryAllowed=typeof info?.reviewMode==='boolean';
      this.setData({reviewMode:info?.reviewMode===true});
      if (info && info.user && info.user.status === 'active' && api.token()) {
        await api.refresh(true);
        wx.switchTab({ url: '/pages/home/index' });
        return;
      }

      let mode = 'login';
      let message = '';
      if (this.data.setupToken) {
        mode = 'setup';
      } else if (this.data.resetToken) {
        mode = 'reset';
      } else if (info && info.initialized === false) {
        mode = 'login';
        message = '负责人尚未完成初始化，请稍后再试。';
      } else if (!info || !info.user) {
        mode = this.data.invite&&!this.data.reviewMode ? 'register' : 'login';
      } else if (info.user.status !== 'active') {
        this.showPending(info.user);
        return;
      }

      this.setData({ mode: mode, message: message, ready: true, loading: false });
      this.syncCopy();
      if(mode==='login')this.restoreLoginMemory();
    } catch (e) {
      this._memoryAllowed=false;
      this.setData({ mode: 'login', message: e.message || '暂时无法连接', ready: true, loading: false });
      this.syncCopy();
    }
  },

  showPending(user) {
    this.setData({
      loading: false,
      ready: true,
      pending: true,
      disabled: !!(user && user.status === 'disabled'),
      pendingUser: user || null,
      pendingName: (user && user.name) || (user && user.username) || '',
      pendingDept: (user && user.dept) || '',
      message: '',
      error: ''
    });
  },

  input(e) {
    const key = e.currentTarget.dataset.key;
    if(key==='username'||key==='password')this._memoryEpoch++;
    if(key==='username'&&this._restoredUsername&&e.detail.value!==this._restoredUsername){this._restoredUsername='';this.setData({password:''});}
    this.setData({ [key]: e.detail.value });
    if(key==='username'){this.clearSecurity();}
    if (key === 'invite' && this.data.mode === 'register') this.syncCopy();
  },

  dept(e) {
    const index = Number(e.detail.value);
    this.setData({ deptIndex: index, dept: depts[index] });
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if(mode==='register'&&this.data.reviewMode)return;
    this.setData({ mode: mode, message: '', error: '', pending: false });
    this.syncCopy();
    this.clearSecurity();
    this._memoryEpoch++;
    this.setData({password:'',confirm:''});
  },

  validate() {
    const d = this.data;

    if (d.mode === 'setup' && !d.setupToken.trim()) {
      throw new Error('缺少初始化链接');
    }
    if (d.mode === 'reset' && !d.resetToken.trim()) {
      throw new Error('请输入重置码');
    }

    if (d.mode !== 'reset') {
      const username = d.username.trim();
      if (!username) throw new Error('请输入用户名');
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/.test(username)) {
        throw new Error('用户名请用 3—32 位英文字母、数字或 . _ -');
      }
      if ((d.mode === 'register' || d.mode === 'setup') && !d.name.trim()) {
        throw new Error('请输入姓名');
      }
    }

    if (d.mode === 'login') {
      if(d.passwordLocked)throw new Error('密码错误已达 10 次，请联系管理员重置密码。');
      if(d.cooldown>0)throw new Error('请等待冷却结束后再登录。');
      if(d.captchaRequired&&(!d.captchaId||!d.captchaAnswer.trim()))throw new Error('请输入验证码。');
      if (!d.password) throw new Error('请输入密码');
      return;
    }

    if (d.password.length < 10) throw new Error('密码至少 10 个字符');
    if (d.password !== d.confirm) throw new Error('两次输入的密码不一致');
  },

  async submit() {
    if (this.data.busy) return;

    let path;
    let data;
    try {
      this.validate();
      const d = this.data;
      if (d.mode === 'login') {
        path = 'login';
        data = { username: d.username.trim(), password: d.password, captchaId:d.captchaId,captchaAnswer:d.captchaAnswer,remember:d.remember===true };
      } else if (d.mode === 'register') {
        path = 'register';
        data = { username: d.username.trim(), name: d.name.trim(), dept: d.dept, password: d.password, invite: d.invite.trim() };
      } else if (d.mode === 'setup') {
        path = 'setup';
        data = { token: d.setupToken, username: d.username.trim(), name: d.name.trim(), dept: d.dept, password: d.password };
      } else if (d.mode === 'reset') {
        path = 'recover';
        data = { token: d.resetToken, password: d.password };
      } else {
        throw new Error('未知登录模式');
      }
    } catch (e) {
      this.setData({ error: e.message || '请检查输入' });
      return;
    }

    this.setData({ busy: true, error: '' });
    const operationEpoch=this._memoryEpoch,operationRealm=LoginMemory.realm(api.config?.()||{});
    try {
      const d = this.data;
      await api.call(path, data);

      if (d.mode === 'reset') {
        if(!this.data.reviewMode)LoginMemory.forgetPassword();
        this.setData({ mode: 'login', message: '密码已更新，请登录。', password: '', confirm: '', resetToken: '' });
        this.clearSecurity();
        this.syncCopy();
        return;
      }

      const info = await api.call('info');
      if (info && info.user && info.user.status === 'active') {
        await api.refresh(true);
        if(path==='login'&&!this.data.reviewMode&&!info.reviewMode&&!this._memoryDisposed&&operationEpoch===this._memoryEpoch&&operationRealm===LoginMemory.realm(api.config?.()||{}))await LoginMemory.success(api.config?.()||{},data.username,data.password,data.remember,info.user.owner===true);
        this.setData({password:'',confirm:''});
        wx.switchTab({ url: '/pages/home/index' });
        return;
      }

      this.setData({password:'',confirm:''});
      this.showPending((info && info.user) || { status: 'pending', name: d.name || d.username, dept: d.dept });
    } catch (e) {
      this.setData({ error: e.message || '操作失败' });
      if(path==='login'){this.securityState(e);if(e.captchaRequired&&!e.locked)await this.refreshCaptcha();}
    } finally {
      this.setData({ busy: false });
    }
  },

  async check() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      const info = await api.call('info');
      if (info && info.user && info.user.status === 'active') {
        await api.refresh(true);
        wx.switchTab({ url: '/pages/home/index' });
        return;
      }
      if (info && info.user) this.showPending(info.user);
      else this.setData({ pending: false, mode: 'login', message: '', error: '' });
    } catch (e) {
      wx.showToast({ title: e.message || '检查失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  async logout() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await api.call('logout', {});
    } catch (e) {
      // 即使服务端会话已失效，也继续清理本地状态。
    }
    api.clear();
    this.clearSecurity();
    this.setData({
      busy: false,
      pending: false,
      disabled: false,
      pendingUser: null,
      mode: 'login',
      message: '',
      error: '',
      username: '',
      name: '',
      invite: '',
      password: '',
      confirm: ''
    });
    this.syncCopy();
  },

  connection() {
    wx.navigateTo({ url: '/pages/connection/index' });
  },
  async restoreLoginMemory(){const config=api.config?.()||{},epoch=++this._memoryEpoch;this._memoryRealm=LoginMemory.realm(config);if(!this._memoryAllowed||this.data.reviewMode){this._restoredUsername='';this.setData({remember:false,username:'',password:'',memoryLoaded:true});return}const memory=await LoginMemory.load(config);if(this._memoryDisposed||epoch!==this._memoryEpoch||this.data.busy||this.data.mode!=='login')return;this._restoredUsername=memory.username;this.setData({remember:memory.remember,username:memory.username,password:memory.password,secureMemory:memory.secure,memoryLoaded:true})},
  rememberChange(e){if(this.data.busy)return;const remember=(e.detail.value||[]).includes('remember');this._memoryEpoch++;if(!remember&&!this.data.reviewMode){LoginMemory.forget();this._restoredUsername='';}this.setData({remember})},
  forgetRemembered(){if(this.data.busy)return;this._memoryEpoch++;if(!this.data.reviewMode)LoginMemory.forget();this._restoredUsername='';this.setData({remember:false,username:'',password:''});this.clearSecurity()},
  clearSecurity(){clearInterval(this._securityTimer);this._securityEpoch=(this._securityEpoch||0)+1;this.setData({captchaRequired:false,captchaId:'',captchaAnswer:'',captchaImage:'',cooldown:0,passwordLocked:false,securityHint:''})},
  securityState(meta){const next={};if(typeof meta.locked==='boolean')next.passwordLocked=meta.locked;if(typeof meta.required==='boolean'||typeof meta.captchaRequired==='boolean')next.captchaRequired=!!(meta.required??meta.captchaRequired);if(meta.id)next.captchaId=meta.id;if(meta.image?.startsWith('data:image/png;base64,')){next.captchaImage=meta.image;next.captchaAnswer=''}if(Number.isFinite(meta.retryAfter)){this._cooldownUntil=Date.now()+Math.max(0,meta.retryAfter)*1000;next.cooldown=Math.max(0,Math.ceil((this._cooldownUntil-Date.now())/1000))}this.setData(next);this.securityTick();clearInterval(this._securityTimer);if(this.data.cooldown)this._securityTimer=setInterval(()=>this.securityTick(),500)},
  securityTick(){const seconds=Math.max(0,Math.ceil(((this._cooldownUntil||0)-Date.now())/1000)),en=this.data.language==='en';this.setData({cooldown:seconds,securityHint:this.data.passwordLocked?(en?'10 incorrect passwords. Contact an administrator for a reset link.':'密码错误已达 10 次，请联系管理员获取重置链接。'):seconds?(en?'Please wait '+seconds+' seconds.':'冷却中，请 '+seconds+' 秒后重试。'):this.data.captchaRequired?(en?'Enter the 5 characters. Tap the image to refresh.':'请输入 5 位验证码，点击图片可更换。'):''});if(!seconds)clearInterval(this._securityTimer)},
  async refreshCaptcha(){if(this.data.mode!=='login')return;const username=this.data.username.trim().toLowerCase();if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username))return;const epoch=++this._securityEpoch;try{const meta=await api.call('captcha',{username});if(epoch!==this._securityEpoch||username!==this.data.username.trim().toLowerCase())return;this.securityState(meta)}catch{if(epoch===this._securityEpoch)this.setData({securityHint:'验证码读取失败，请重试。'})}},
  usernameBlur(){this.refreshCaptcha()},
  onHide(){this._securityEpoch=(this._securityEpoch||0)+1;clearInterval(this._securityTimer)},
  onShow(){if(this.data.ready&&!this.data.pending&&this.data.mode==='login'&&this._memoryRealm!==LoginMemory.realm(api.config?.()||{})){this._memoryAllowed=false;this.setData({username:'',password:''});this.bootstrap()}if(this.data.cooldown){this.securityTick();if(this.data.cooldown)this._securityTimer=setInterval(()=>this.securityTick(),500)}},
  onUnload(){this._memoryDisposed=true;this._memoryEpoch++;this._securityEpoch=(this._securityEpoch||0)+1;clearInterval(this._securityTimer);this.setData({password:'',confirm:''})}
}));
