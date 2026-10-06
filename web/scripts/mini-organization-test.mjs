import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url), stored = {}, timers = new Map();
let now = 1000, nextTimer = 1, activeState;
const board = {width: 480, height: 740, left: 12, top: 90};
const members = [
  {id: 'admin', name: '真实管理员姓名', username: 'admin', dept: '办公室', role: 'admin', status: 'active', owner: true},
  {id: 'manager', name: '真实负责人姓名', username: 'manager', dept: '办公室', role: 'manager', status: 'active'},
  {id: 'member', name: '我的任务', username: 'member', dept: '办公室', role: 'member', status: 'active'},
  {id: 'inactive', name: '停用姓名', username: 'inactive', dept: '办公室', role: 'member', status: 'disabled'},
  {id: 'designer', name: '真实设计师姓名', username: 'designer', dept: '创意设计部', role: 'member', status: 'active'}
];
globalThis.wx = {
  getStorageSync: key => stored[key], setStorageSync: (key, value) => {stored[key] = value;},
  getSystemInfoSync: () => ({theme: 'light'}), setNavigationBarColor() {}, setNavigationBarTitle() {},
  setBackgroundColor() {}, setTabBarStyle() {}, setTabBarItem() {},
  createSelectorQuery: () => ({in() {return this;}, select() {return this;}, boundingClientRect(callback) {callback(board); return this;}, exec() {}})
};
const V = require('../../miniprogram/utils/view.js'), O = require('../../miniprogram/utils/organization.js'), F = require('../../miniprogram/utils/floating.js');
V.api.call = async path => {assert.equal(path, 'members'); return {members, reviews: []};};
V.api.subscribe = () => () => {};
V.api.getState = () => activeState;
V.api.token = () => 'mock-session-not-a-real-token';
V.api.refresh = async () => activeState;
class FakeDate extends Date {static now() {return now;}}
const source = readFileSync(new URL('../../miniprogram/pages/members/index.js', import.meta.url), 'utf8');
function update(target, path, value) {
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let node = target;
  for (const segment of segments.slice(0, -1)) node = node[segment] ||= {};
  node[segments.at(-1)] = value;
}
function load() {
  let page;
  vm.runInNewContext(source, {Date: FakeDate, wx: globalThis.wx, Page: value => {page = value;},
    setInterval: callback => {const id = nextTimer++; timers.set(id, callback); return id;},
    clearInterval: id => timers.delete(id),
    require: name => name.endsWith('/view') ? V : name.endsWith('/organization') ? O : F
  });
  page.data = structuredClone(page.data);
  page.setData = function (patch, callback) {for (const [key, value] of Object.entries(patch)) update(this.data, key, value); callback?.();};
  page.route = 'pages/members/index'; page.onLoad({});
  return page;
}
const step = (count = 1) => {for (let i = 0; i < count; i++) {now += 33; for (const callback of [...timers.values()]) callback();}};
const closePosition = (actual, expected, message) => assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < .001, message);
const flush = async () => {await Promise.resolve(); await Promise.resolve();};
const snapshot = settings => ({user: members[0], people: members, tasks: [], events: [], settings: {language: 'en', motion: true, particles: 'off', ...settings}});
activeState = snapshot();
const page = load();
page.renderState(V.decorate(activeState));
await flush();
assert.equal(timers.size, 1);
await page.onShow();
assert.equal(timers.size, 1, 'show/render must not create duplicate animation timers');
assert.equal(page.boardSize.width, board.width);
assert.equal(page.boardSize.height, board.height);
assert.equal(page.data.network.length, 4);
assert.deepEqual(Array.from(page.data.network[0].people, person => person.id), ['admin', 'manager', 'member']);
assert.equal(page.data.network[0].people[2].name, '我的任务', 'English UI preserves a member name matching translated UI text');
assert.equal(page.data.network[0].people[0].roleLabel, 'Administrator');

const ranges = page.data.network.map(() => ({minX: 100, maxX: 0, minY: 100, maxY: 0}));
let maxFrameDistance = 0;
for (let frame = 0; frame < 2100; frame++) {
  const previous = page.data.network.map(node => [node.x, node.y]);
  step();
  page.data.network.forEach((node, index) => {
    assert.ok(node.x >= 15 && node.x <= 85 && node.y >= 14 && node.y <= 84, 'spring remains within safe board bounds');
    const range = ranges[index]; range.minX = Math.min(range.minX, node.x); range.maxX = Math.max(range.maxX, node.x); range.minY = Math.min(range.minY, node.y); range.maxY = Math.max(range.maxY, node.y);
    maxFrameDistance = Math.max(maxFrameDistance, Math.hypot(node.x - previous[index][0], node.y - previous[index][1]));
    const physical = F.line(node.x, node.y, board.width, board.height);
    assert.ok(Math.abs(node.lineAngle - physical.lineAngle) < .004, 'line angle follows current measured board geometry');
    assert.ok(Math.abs(node.lineLength - physical.lineLength) < .004, 'line length reaches the current moving node');
  });
}
assert.ok(ranges.every(range => range.maxX - range.minX > 10 && range.maxY - range.minY > 14), 'floating amplitude is substantially larger than the old few-pixel CSS float');
assert.ok(maxFrameDistance < 1, 'spring movement is gradual at every 33ms frame');
const expectedLine = F.line(75, 25, 400, 800);
assert.ok(Math.abs(expectedLine.lineAngle + 63.43494882292201) < 1e-8);
assert.ok(Math.abs(expectedLine.lineLength - Math.hypot(100, 200) / 400 * 100) < 1e-8);
assert.equal(F.line(50, 50, 400, 800).lineLength, 0);

page.department({currentTarget: {dataset: {dept: '办公室'}}});
const expandedPosition = [page.data.network[0].x, page.data.network[0].y];
const otherPosition = [page.data.network[1].x, page.data.network[1].y];
step(25);
closePosition([page.data.network[0].x, page.data.network[0].y], expandedPosition, 'expanded department pauses to keep member targets usable');
assert.notDeepEqual([page.data.network[1].x, page.data.network[1].y], otherPosition, 'other departments keep floating');
page.person({currentTarget: {dataset: {id: 'member'}}});
const personPaused = structuredClone(page.data.network);
step(25);
assert.deepEqual(page.data.network, personPaused, 'member profile freezes node movement until dismissed');
assert.equal(page.data.selectedPerson.name, '我的任务');
page.closePerson();
page.department({currentTarget: {dataset: {dept: '办公室'}}});
step(10);

const shown = [page.data.network[0].x, page.data.network[0].y];
page.dragStart({currentTarget: {dataset: {index: 0}}, touches: [{clientX: 150, clientY: 210}]});
assert.ok(Math.abs(page.drag.pos[0] - shown[0]) < .001 && Math.abs(page.drag.pos[1] - shown[1]) < .001, 'drag starts at the current spring position rather than its stale anchor');
page.dragMove({touches: [{clientX: 160, clientY: 224}]});
assert.ok(Math.abs(page.data.network[0].x - (page.drag.pos[0] + 10 / board.width * 100)) < .001);
assert.ok(Math.abs(page.data.network[0].y - (page.drag.pos[1] + 14 / board.height * 100)) < .001);
const dragged = [page.data.network[0].x, page.data.network[0].y];
step(10);
closePosition([page.data.network[0].x, page.data.network[0].y], dragged, 'dragged node stays under the pointer while other nodes move');
page.dragEnd();
closePosition([page.data.network[0].x, page.data.network[0].y], dragged, 'release does not teleport the node');
step();
assert.ok(Math.hypot(page.data.network[0].x - dragged[0], page.data.network[0].y - dragged[1]) < .5, 'release returns into the float through the spring smoothly');
step(25);
assert.notDeepEqual([page.data.network[0].x, page.data.network[0].y], dragged);
page.dragStart({currentTarget: {dataset: {index: 0}}, touches: [{clientX: 0, clientY: 0}]});
page.dragMove({touches: [{clientX: 100000, clientY: -100000}]});
assert.deepEqual(Array.from(page.data.positions[0]), [83, 16], 'extreme dragging clamps to safe bounds');
page.dragEnd();

page.onHide();
assert.equal(timers.size, 0);
const hidden = structuredClone(page.data.network);
step(50);
assert.deepEqual(page.data.network, hidden);
page.renderState(V.decorate(activeState));
await flush();
assert.equal(timers.size, 0, 'state refresh while hidden does not restart movement');
await page.onShow();
assert.equal(timers.size, 1);
page.onUnload();
assert.equal(timers.size, 0);

activeState = snapshot({motion: false});
const disabled = load();
disabled.renderState(V.decorate(activeState));
await flush();
assert.equal(disabled.data.motion, false);
assert.equal(timers.size, 0);
await disabled.onShow();
assert.equal(timers.size, 0, 'motion-off never schedules animation');
disabled.onUnload();
console.log('PASS: native organization bounded elastic motion, large amplitude and gradual frames, accurate lines, interaction pauses, smooth dragging, timer lifecycle, motion-off and unchanged English-mode names.');
