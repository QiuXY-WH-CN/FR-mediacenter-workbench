const V = require('../../utils/view');
const UI = require('../../utils/interface');

Page(V.page({
  data: { bound: false, cloud: false },
  renderState(s) {
    this.setData({
      user: s.user,
      role: s.roleLabel,
      departmentLabel: UI.t(s.user.dept||'无部门'),
      manager: s.manager,
      points: s.ledger.filter(x => x.user === s.user.id).reduce((n, x) => n + Math.round(Number(x.points || 0) * 100), 0) / 100,
      cloud: V.api.config().transport === 'cloud',
      shareLabel: UI.t('分享小程序'),
      profileLabel: UI.t('头像、姓名与账号设置')
    });
  },
  async onShow() {
    if (V.api.config().transport === 'cloud') {
      try {
        const b = await V.api.call('wechat/status');
        this.setData({ bound: b.bound });
      } catch {}
    }
  },
  async binding() {
    await V.action(this, async () => {
      const b = await V.api.call(this.data.bound ? 'wechat/unbind' : 'wechat/bind', {});
      this.setData({ bound: b.bound });
      wx.showToast({ title: UI.t(b.bound ? '绑定成功' : '已解除绑定') });
    });
  },
  async logout() {
    await V.action(this, async () => {
      try {
        await V.api.call('logout', {});
      } finally {
        // Clear the current device even if the network or session has expired.
        V.api.clear();
        wx.reLaunch({ url: '/pages/auth/index' });
      }
    });
  },
  async switchAccount() {
    await this.logout();
  }
}));
