const api = require('./services/api');

App({
  onLaunch(options) {
    this.applyAuthQuery(options);
    this.hydrate();
  },

  onShow(options) {
    this.applyAuthQuery(options);
    this.startPolling();
    if (api.token()) api.refresh().catch(() => {});
  },

  onHide() {
    this.stopPolling();
  },

  applyAuthQuery(options) {
    const query = (options && options.query) || {};
    if (query.invite || query.reset || query.setup) {
      this.pendingAuth = {
        invite: query.invite || '',
        reset: query.reset || '',
        setup: query.setup || ''
      };
    }
  },

  hydrate() {
    if (!api.token()) return;
    api.call('info')
      .then((info) => {
        if (info && info.user && info.user.status === 'active') {
          api.refresh(true).catch(() => {});
        } else {
          api.clear();
        }
      })
      .catch(() => {});
  },

  startPolling() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (api.token()) api.refresh().catch(() => {});
    }, api.config().pollMs);
  },

  stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
});
