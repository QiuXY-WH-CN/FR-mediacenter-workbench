const UI = require('./interface');

// A fixed public cover prevents WeChat's default page screenshot from exposing
// task details, profile information or one-use authentication codes.
const IMAGE = '/images/emblem.png';
const HOME = '/pages/home/index';
const QUERY = 'share=workbench';

function title() {
  return UI.language() === 'en' ? 'Fengru Media Workspace' : '冯如学媒协作工作台';
}

function message() {
  return { title: title(), path: HOME, imageUrl: IMAGE };
}

function timeline() {
  // Timeline shares retain the current page route. Replace all incoming query
  // fields, and let the page wrapper take recipients to the public entry point.
  return { title: title(), query: QUERY, imageUrl: IMAGE };
}

function preview() {
  return Number(wx.getLaunchOptionsSync?.().scene) === 1154;
}

function publicPreview(owner) {
  const english = UI.language() === 'en';
  owner.setData({
    sharePreview: true,
    sharePublicTitle: title(),
    sharePublicDescription: english
      ? 'A department workspace for Fengru Media, with task assignments, calendar planning, reusable workflows and an organization chart. Team content is available only to approved accounts.'
      : '面向冯如学媒的部门协作工作台，支持任务分工、日历排期、流程模板和组织架构。团队内容仅对经审核的账号开放。',
    sharePublicNote: english
      ? 'This page introduces the workspace without displaying internal schedules or member information.'
      : '此页面仅展示工作台介绍，不包含内部日程或成员信息。'
  });
}

function enable() {
  if (preview() || typeof wx.showShareMenu !== 'function') return;
  wx.showShareMenu({
    withShareTicket: false,
    menus: ['shareAppMessage', 'shareTimeline'],
    fail() {
      // Older base libraries can still forward to a chat.
      wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage'] });
    }
  });
}

function enter(options, route = '') {
  if (options?.share !== 'workbench' || route === 'pages/home/index') return false;
  wx.switchTab({ url: HOME });
  return true;
}

function page(spec) {
  const load = spec.onLoad, show = spec.onShow, refresh = spec.onPullDownRefresh;
  return {
    ...spec,
    onLoad(options = {}) {
      this.sharePreview = preview();
      if (this.sharePreview) {
        publicPreview(this);
        return;
      }
      enable();
      this.sharedEntry = enter(options, this.route);
      if (this.sharedEntry) return;
      return load?.call(this, options);
    },
    onShow() {
      if (this.sharePreview || preview()) return;
      enable();
      if (this.sharedEntry) return;
      return show?.call(this);
    },
    onPullDownRefresh() {
      if (this.sharePreview || preview()) { wx.stopPullDownRefresh?.(); return; }
      return refresh?.call(this);
    },
    // Override page-specific hooks so secrets cannot accidentally reappear.
    onShareAppMessage: message,
    onShareTimeline: timeline
  };
}

module.exports = { message, timeline, enable, enter, page, preview };
