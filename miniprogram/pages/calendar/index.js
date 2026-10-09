const V = require('../../utils/view');
const O = require('../../utils/organization');
const M = require('../../utils/task-model');

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const labels = {
  monthEvents: ['本月活动', 'Events this month'], monthTasks: ['本月截止', 'Due this month'],
  dueToday: ['当日截止', 'Due this day'], activeEvent: ['活动期间', 'Event in progress'],
  nearest: ['最近有安排', 'Next scheduled date'], emptyDay: ['本日没有可见安排', 'No visible schedule for this day'],
  emptyMonth: ['本月没有可见安排', 'No visible schedule for this month'],
  noChildren: ['当前没有可见分任务', 'No subtasks visible to your account'],
  showOther: ['展开其他分任务', 'Show other subtasks'], hideOther: ['收起其他分任务', 'Hide other subtasks'],
  previousMonth: ['上个月', 'Previous month'], nextMonth: ['下个月', 'Next month'], previousDay: ['前一天', 'Previous day'], nextDay: ['后一天', 'Next day']
};
const dateKey = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : '';
const contains = (event, key) => !!dateKey(event.date) && dateKey(event.date) <= key && (dateKey(event.endDate) || dateKey(event.date)) >= key;

Page(V.page({
  data: {
    year: new Date().getFullYear(), month: new Date().getMonth() + 1,
    selected: V.day(), week: ['一', '二', '三', '四', '五', '六', '日'],
    deptIndex: 0, depts: ['全部可见部门', ...V.depts], cells: [], selectedGroups: [], viewMode:'month', timelineRows:[]
  },
  renderState(snapshot) {
    this.snapshot = snapshot;
    if (!this.calendarInitialized) {
      this.calendarInitialized = true;
      const deptIndex = this.data.depts.indexOf(snapshot.settings?.workspace);
      if (deptIndex > 0) this.setData({deptIndex});
      const visible = this.visibleSchedule();
      if (!this.hasSchedule(this.data.selected, visible)) {
        const next = this.closestDate(this.data.selected, visible, this.data.selected.slice(0, 7));
        if (next) this.setDate(next);
      }
    }
    this.calendar();
  },
  onShow(){if(this.clockTimer)clearInterval(this.clockTimer);this.clockTimer=setInterval(()=>this.calendar(),60000)},
  onHide(){if(this.clockTimer)clearInterval(this.clockTimer);this.clockTimer=null},
  onUnload(){if(this.clockTimer)clearInterval(this.clockTimer)},
  mode(event){this.setData({viewMode:event.currentTarget.dataset.id});this.calendar()},
  visibleSchedule() {
    // Use only the server's authorized snapshot; selection never fetches hidden tasks.
    const dept = this.data.deptIndex ? this.data.depts[this.data.deptIndex] : '';
    const tasks = (this.snapshot?.tasks || []).filter(task => !dept || (task.depts || [task.dept]).includes(dept));
    const events = (this.snapshot?.events || []).filter(event => !dept || event.department === dept || tasks.some(task => task.event === event.id));
    return {tasks, events, dept};
  },
  hasSchedule(key, visible = this.visibleSchedule()) {
    return visible.tasks.some(task => dateKey(task.due) === key) || visible.events.some(event => contains(event, key));
  },
  closestDate(reference, visible = this.visibleSchedule(), monthPrefix = '') {
    const dates = new Set(visible.tasks.map(task => dateKey(task.due)).filter(Boolean));
    visible.events.forEach(event => {
      const start = dateKey(event.date), end = dateKey(event.endDate) || start;
      if (start) dates.add(start);
      if (end) dates.add(end);
      if (contains(event, reference)) dates.add(reference);
      if (monthPrefix) {
        const first = monthPrefix + '-01';
        const last = V.day(new Date(Number(monthPrefix.slice(0, 4)), Number(monthPrefix.slice(5)), 0));
        if (start && start <= last && end >= first) dates.add(start < first ? first : start);
      }
    });
    const available = [...dates].filter(key => !monthPrefix || key.startsWith(monthPrefix)).sort();
    return available.find(key => key >= reference) || available[available.length - 1] || '';
  },
  setDate(key) {
    if (!dateKey(key)) return;
    this.setData({selected: key, year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7))});
  },
  calendar() {
    if (!this.snapshot) return;
    const {tasks, events, dept} = this.visibleSchedule();
    const year = this.data.year, month = this.data.month, selected = this.data.selected;
    const first = new Date(year, month - 1, 1), total = new Date(year, month, 0).getDate();
    const padding = (first.getDay() + 6) % 7, today = V.day();
    const english = this.snapshot.settings?.language === 'en';
    const calendarLabels = Object.fromEntries(Object.entries(labels).map(([key, value]) => [key, value[english ? 1 : 0]]));
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const days = Array.from({length: total}, (_, index) => {
      const id = prefix + '-' + String(index + 1).padStart(2, '0');
      const due = tasks.filter(task => dateKey(task.due) === id);
      const active = events.filter(event => contains(event, id));
      return {id, number: index + 1, today: id === today, tasks: due.length,
        events: active.length, total: due.length + active.length, completed: due.length>0&&due.every(task=>task.status==='done'),
        urgent: due.some(task => task.scheduleEnabled!==false && task.status !== 'done' && ['urgent', 'high'].includes(task.priority)),
        inactive:due.length>0&&due.every(task=>task.scheduleEnabled===false),
        preview: due[0]?.name || active[0]?.name || ''};
    });
    const selectedTasks = tasks.filter(task => dateKey(task.due) === selected).sort(M.compare);
    const selectedEvents = events.filter(event => contains(event, selected));
    // On an event day expose its children; collapse later deadlines when due tasks exist.
    const selectedGroups = M.groups(events, tasks).filter(group => contains(group, selected) || group.tasks.some(task => dateKey(task.due) === selected)).map(group => {
      const active = contains(group, selected);
      const children = active ? group.tasks : group.tasks.filter(task => dateKey(task.due) === selected);
      const deadlines = children.filter(task => dateKey(task.due) === selected);
      const others = children.filter(task => dateKey(task.due) !== selected);
      const expanded = !!this.expandedGroups?.[group.id];
      const primary = deadlines.length ? deadlines : children;
      const secondary = deadlines.length ? others : [];
      return {...group, sortTask: primary[0] || group.sortTask, openable: true, tasks: primary.map(task => ({...task, dueToday: dateKey(task.due) === selected})),
        otherTasks: secondary.map(task => ({...task, dueToday: false})), expanded,
        taskCount: children.length, deadlineCount: deadlines.length,
        dateLabel: dateKey(group.date) + (dateKey(group.endDate) && group.endDate !== group.date ? ' — ' + dateKey(group.endDate) : ''),
        scheduleLabel: active ? calendarLabels.activeEvent : calendarLabels.dueToday};
    });
    const standalone = selectedTasks.filter(task => !events.some(event => event.id === task.event));
    if (standalone.length) selectedGroups.push({id: '__standalone__', name: english ? 'Tasks' : '任务', openable: false, tasks: standalone.map(task => ({...task, dueToday: true})), otherTasks: [], taskCount: standalone.length, deadlineCount: standalone.length, dateLabel: selected, scheduleLabel: calendarLabels.dueToday});
    selectedGroups.sort((a, b) => M.compare(a.sortTask || a.tasks[0] || {due: a.dateLabel, status: 'done'}, b.sortTask || b.tasks[0] || {due: b.dateLabel, status: 'done'}));
    const firstKey = prefix + '-01', lastKey = prefix + '-' + String(total).padStart(2, '0');
    const now=new Date(),currentTime=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),currentMonth=today.startsWith(prefix),todayFraction=(now.getHours()*60+now.getMinutes())/1440;
    const timelineAnchor=this.timelineAnchorMonth===prefix?{}:{timelineScrollLeft:Math.max(0,(Number((currentMonth?today:selected).slice(8))-3)*96)*(wx.getWindowInfo?.().windowWidth||wx.getSystemInfoSync?.().windowWidth||375)/750};this.timelineAnchorMonth=prefix;
    const timelineRows=M.groups(events,tasks).map(group=>{const dates=[dateKey(group.date),dateKey(group.endDate),...group.tasks.map(task=>dateKey(task.due))].filter(Boolean).sort(),start=dates[0],end=dates[dates.length-1];if(!start||start>lastKey||end<firstKey)return null;const left=Math.max(0,(Date.parse(start+'T12:00:00Z')-Date.parse(firstKey+'T12:00:00Z'))/86400000),right=Math.min(total,(Date.parse(end+'T12:00:00Z')-Date.parse(firstKey+'T12:00:00Z'))/86400000+1),completed=group.scheduleState?group.scheduleState==='archived':group.tasks.length>0&&group.tasks.every(t=>t.status==='done'),startAt=Date.parse(start+'T'+(start===dateKey(group.date)&&group.allDay===false?group.startTime||'00:00':'00:00')+':00'),endAt=Date.parse(end+'T'+(end===dateKey(group.endDate||group.date)&&group.allDay===false?group.endTime||'23:59':'23:59')+':59'),phase=completed||endAt<now.getTime()?'ended':startAt>now.getTime()?'upcoming':'ongoing';return {...group,left:left*96,width:Math.max(84,(right-left)*96-8),phase,phaseLabel:english?{ended:'Ended',upcoming:'Upcoming',ongoing:'In progress'}[phase]:{ended:'已结束',upcoming:'未开始',ongoing:'进行中'}[phase],departmentColor:O.color(group.department||group.tasks[0]?.dept)}}).filter(Boolean);
    this.setData({
      departmentColor: O.color(dept), calendarLabels,
      monthLabel: english ? `${monthNames[month - 1]} ${year}` : `${year} 年 ${month} 月`,
      week: english ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['一', '二', '三', '四', '五', '六', '日'],
      days, cells: [...Array.from({length: padding}, (_, index) => ({id: 'empty-' + index, empty: true})), ...days],
      monthTaskCount: tasks.filter(task => dateKey(task.due).startsWith(prefix)).length,
      monthEventCount: events.filter(event => dateKey(event.date) && dateKey(event.date) <= lastKey && (dateKey(event.endDate) || dateKey(event.date)) >= firstKey).length,
      selectedEvents, selectedTasks, selectedGroups,
      nearestDate: this.closestDate(selected, {tasks, events}),
      monthHasSchedule: days.some(day => day.total)
      ,...timelineAnchor,viewModes:[{id:'month',label:english?'Month':'月历'},{id:'timeline',label:english?'Timeline':'时间轴'}],timelineRows,timelineWidth:total*96,showNowLine:currentMonth,nowLineLeft:(Number(today.slice(8))-1+todayFraction)*96,currentTime,timelineEmpty:english?'No schedules this month':'本月没有日程'
    });
  },
  month(event) {
    const date = new Date(this.data.year, this.data.month - 1 + Number(event.currentTarget.dataset.delta), 1);
    const target = V.day(date), prefix = target.slice(0, 7);
    const available = this.closestDate(target, this.visibleSchedule(), prefix);
    this.expandedGroups = {};
    this.setDate(available || target);
    this.calendar();
  },
  choose(event) {
    const key = event.currentTarget.dataset.id;
    if (!dateKey(key)) return;
    this.expandedGroups = {};
    this.setDate(key);
    this.calendar();
  },
  shiftDay(event) {
    this.expandedGroups = {};
    this.setDate(V.shift(this.data.selected, Number(event.currentTarget.dataset.delta)));
    this.calendar();
  },
  dept(event) {
    const index = Number(event.detail.value);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.depts.length) return;
    this.setData({deptIndex: index});
    this.expandedGroups = {};
    if (!this.hasSchedule(this.data.selected)) {
      const next = this.closestDate(this.data.selected, this.visibleSchedule(), this.data.selected.slice(0, 7));
      if (next) this.setDate(next);
    }
    this.calendar();
  },
  toggleOthers(event) {
    const id = event.currentTarget.dataset.id;
    this.expandedGroups ||= {};
    this.expandedGroups[id] = !this.expandedGroups[id];
    this.calendar();
  },
  openCalendarEvent(event) {
    if (this.data.selectedGroups.some(group => group.openable && group.id === event.currentTarget.dataset.id)) this.openEvent(event);
  },
  today() {this.expandedGroups = {}; this.setDate(V.day()); this.calendar();},
  nearest() {if (this.data.nearestDate) {this.setDate(this.data.nearestDate); this.calendar();}},
  touchStart(event) {
    const point = event.touches?.[0];
    this.calendarTouch = point ? {x: point.clientX, y: point.clientY} : null;
  },
  touchEnd(event) {
    const point = event.changedTouches?.[0], start = this.calendarTouch;
    this.calendarTouch = null;
    if (!point || !start) return;
    const dx = point.clientX - start.x, dy = point.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) this.month({currentTarget: {dataset: {delta: dx < 0 ? 1 : -1}}});
  }
}));
