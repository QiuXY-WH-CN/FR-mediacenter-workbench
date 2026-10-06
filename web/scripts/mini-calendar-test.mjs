import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
globalThis.wx = {getStorageSync() {}, getSystemInfoSync: () => ({theme: 'light'})};
const realView = require('../../miniprogram/utils/view.js');
const model = require('../../miniprogram/utils/task-model.js');
const organization = require('../../miniprogram/utils/organization.js');
const fixedToday = '2026-10-06';
class FixedDate extends Date {constructor(...args) {super(...(args.length ? args : [fixedToday + 'T12:00:00']));}}
const paths = [];
const V = {...realView, day: (date = new FixedDate()) => realView.day(date), page: spec => ({...spec,
  openTask(event) {paths.push('/pages/task/index?id=' + event.currentTarget.dataset.id);},
  openEvent(event) {paths.push('/pages/event/index?id=' + event.currentTarget.dataset.id);}
})};
const source = readFileSync(new URL('../../miniprogram/pages/calendar/index.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../../miniprogram/pages/calendar/index.wxml', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../miniprogram/pages/calendar/index.wxss', import.meta.url), 'utf8');
function load() {
  let page;
  vm.runInNewContext(source, {Date: FixedDate, Page: spec => {page = spec;}, require: name => name.endsWith('/view') ? V : name.endsWith('/organization') ? organization : model});
  page.data = structuredClone(page.data);
  page.setData = function (data) {Object.assign(this.data, data);};
  return page;
}
const tap = (page, method, value, key = 'id') => page[method]({currentTarget: {dataset: {[key]: value}}});
const task = (id, event, due, priority = 'normal', status = 'active', dept = '办公室') => ({id, event, name: '真实任务 ' + id, owner: 'u', receiver: 'u', due, priority, status, dept});
const base = {user: {id: 'u', name: '原文姓名', role: 'member', dept: '办公室'}, settings: {language: 'zh-CN'}, people: [{id: 'u', name: '原文姓名'}],
  events: [
    {id: 'event-office', name: '跨日大任务', date: '2026-10-10', endDate: '2026-10-12', department: '办公室'},
    {id: 'event-visual', name: '视觉大任务', date: '2026-10-11', department: '视觉传达部'},
    {id: 'event-blank', name: '办公室空白日程', date: '2026-10-11', department: '办公室'},
    {id: 'event-november', name: '下月大任务', date: '2026-11-08', department: '办公室'}
  ],
  tasks: [
    task('normal', 'event-office', '2026-10-10T18:00'),
    task('urgent', 'event-office', '2026-10-10T18:00', 'urgent'),
    task('done', 'event-office', '2026-10-10T09:00', 'urgent', 'done'),
    task('later', 'event-office', '2026-10-12T20:00'),
    task('visual', 'event-visual', '2026-10-11T12:00', 'high', 'active', '视觉传达部'),
    task('november', 'event-november', '2026-11-09T10:00'),
    {...task('missing-due', 'event-office', null), due: null}
  ]};
const page = load();
page.renderState(realView.decorate(base));
assert.equal(page.data.selected, '2026-10-10', 'initially select a scheduled date in the current month');
assert.equal(page.data.days.find(day => day.id === '2026-10-10').tasks, 3);
assert.equal(page.data.days.find(day => day.id === '2026-10-10').urgent, true);
assert.equal(page.data.monthTaskCount, 5);
assert.equal(page.data.monthEventCount, 3);
let office = page.data.selectedGroups.find(group => group.id === 'event-office');
assert.deepEqual(Array.from(office.tasks, task => task.id), ['urgent', 'normal', 'done'], 'deadline ties use priority and completed work stays last');
assert.ok(office.tasks.every(task => task.dueToday));
assert.ok(office.otherTasks.some(task => task.id === 'later'));
assert.equal(office.expanded, false);
tap(page, 'toggleOthers', 'event-office');
assert.equal(page.data.selectedGroups[0].expanded, true);
tap(page, 'choose', '2026-10-11');
office = page.data.selectedGroups.find(group => group.id === 'event-office');
assert.ok(office.tasks.some(task => task.id === 'later'), 'an active event exposes its visible subtasks even when no child is due this day');
assert.equal(office.tasks.length, 5);
tap(page, 'openCalendarEvent', 'event-office');
assert.equal(paths.at(-1), '/pages/event/index?id=event-office');
tap(page, 'openTask', 'later');
assert.equal(paths.at(-1), '/pages/task/index?id=later');

page.dept({detail: {value: 1}});
assert.ok(page.data.selectedGroups.every(group => group.id !== 'event-visual'));
assert.ok(page.data.selectedGroups.some(group => group.id === 'event-blank'), 'retain empty events owned by the selected department');
assert.equal(page.data.monthTaskCount, 4);
page.dept({detail: {value: 3}});
assert.equal(page.data.monthTaskCount, 1);
assert.ok(page.data.selectedGroups.every(group => group.id === 'event-visual'));
page.dept({detail: {value: 0}});
tap(page, 'month', 1, 'delta');
assert.equal(page.data.month, 11);
assert.equal(page.data.selected, '2026-11-08', 'month navigation selects that month’s first scheduled date');
assert.equal(page.data.selectedGroups[0].tasks[0].id, 'november');
tap(page, 'shiftDay', 1, 'delta');
assert.equal(page.data.selected, '2026-11-09');
assert.equal(page.data.selectedGroups[0].tasks[0].dueToday, true);
page.touchStart({touches: [{clientX: 250, clientY: 100}]});
page.touchEnd({changedTouches: [{clientX: 100, clientY: 108}]});
assert.equal(page.data.month, 12);
assert.equal(page.data.monthHasSchedule, false);
assert.equal(page.data.selectedGroups.length, 0);
page.touchStart({touches: [{clientX: 250, clientY: 100}]});
page.touchEnd({changedTouches: [{clientX: 240, clientY: 250}]});
assert.equal(page.data.month, 12, 'vertical scrolling does not change month');
page.today();
assert.equal(page.data.selected, fixedToday);
assert.equal(page.data.selectedGroups.length, 0);
assert.equal(page.data.nearestDate, '2026-10-10');
page.nearest();
assert.equal(page.data.selected, '2026-10-10');
tap(page, 'choose', 'empty-0');
assert.equal(page.data.selected, '2026-10-10');

const limited = load();
limited.renderState(realView.decorate({...base, settings: {language: 'en', workspace: '办公室'}, tasks: base.tasks.filter(task => task.dept === '办公室')}));
assert.equal(limited.data.deptIndex, 1);
assert.equal(limited.data.monthLabel, 'October 2026');
assert.equal(limited.data.week[0], 'Mon');
assert.equal(limited.data.calendarLabels.dueToday, 'Due this day');
assert.equal(limited.data.selectedGroups[0].tasks[0].name, '真实任务 urgent');
limited.dept({detail: {value: 3}});
assert.equal(limited.data.monthTaskCount, 0);
assert.ok(limited.data.selectedGroups.every(group => group.tasks.length === 0), 'public event metadata never reveals unauthorized children');
assert.equal(limited.data.selectedGroups[0].id, 'event-visual');
const empty = load();
empty.renderState(realView.decorate({...base, events: [], tasks: []}));
assert.equal(empty.data.selected, fixedToday);
assert.equal(empty.data.monthHasSchedule, false);
assert.equal(empty.data.selectedGroups.length, 0);
const orphan = load();
orphan.renderState(realView.decorate({...base, events: [], tasks: [task('standalone', 'missing-event', fixedToday + 'T18:00')]}));
assert.equal(orphan.data.selectedGroups[0].tasks[0].id, 'standalone', 'an authorized task is not lost when its parent is missing');
assert.equal(orphan.data.selectedGroups[0].openable, false);
assert.ok(!/native-account|context-dismiss/.test(markup));
assert.ok(markup.includes('bindtap="openTask"') && markup.includes('bindtap="openCalendarEvent"'));
assert.ok(markup.includes('calendar-count') && styles.includes('.calendar-grid{display:flex;'));
assert.equal((markup.match(/<view style="\{\{themeStyle\}\}/g) || []).length, 1);
console.log('PASS: mini calendar visible event/subtask hierarchy, deadline and priority order, month/day/swipe navigation, department scope and privacy, bilingual labels, empty and orphan task states.');
