const V = require('../../utils/view');

Page(V.page({
  data: { busy: false },

  renderState(s) {
    const event = s.events.find(e => e.id === this.options.id);
    this.setData({
      event: event || null,
      tasks: s.tasks.filter(t => t.event === this.options.id),
      seriesName: s.series?.find(series => series.id === event?.seriesId)?.name || ''
    });
  },

  copy() {
    V.copy(this.data.event?.cloudUrl);
  },

  openEditor(mode) {
    wx.navigateTo({ url: '/pages/editor/index?mode=' + mode + '&id=' + encodeURIComponent(this.options.id) });
  },

  reschedule() {
    if (this.data.event?.canEdit) this.openEditor('event-edit');
  },

  duplicate() {
    if (this.data.event?.canCopy) this.openEditor('event-copy');
  },

  saveTemplate() {
    if (this.data.event?.canCopy) this.openEditor('template-from');
  },

  async activation() {
    if (!this.data.event?.canEdit) return;
    let choice, scope = 'this';
    try {
      choice = await wx.showActionSheet({ itemList: ['提前 7 天自动启用', '立即启用', '暂不启用'].map(V.t) });
      if (this.data.event?.recurrenceGroup) {
        const selected = await wx.showActionSheet({ itemList: ['仅此日程', '此日程及之后', '整个重复日程'].map(V.t) });
        scope = ['this', 'future', 'series'][selected.tapIndex];
      }
    } catch {
      return;
    }
    if (!this.data.event?.canEdit) return;
    await V.action(this, () => V.api.mutate('events/activation', {
      id: this.options.id,
      activation: ['auto', 'active', 'paused'][choice.tapIndex],
      scope
    }));
  },

  async removeSchedule() {
    if (!this.data.event?.canDelete) return;
    await V.action(this, async () => {
      const english = this.data.language === 'en';
      const { confirm } = await wx.showModal({
        title: english ? 'Delete schedule' : '删除日程',
        content: english
          ? 'Permanently delete this schedule and all of its tasks?'
          : '确认删除该日程及其全部任务？此操作不可撤销。',
        confirmColor: '#b1212a'
      });
      if (!confirm || !this.data.event?.canDelete) return;
      await V.api.mutate('events/delete', { id: this.options.id });
      wx.showToast({ title: english ? 'Schedule deleted' : '日程已删除' });
      wx.navigateBack();
    });
  }
}));
