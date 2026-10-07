import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync, readFileSync} from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const stored = {}, menuCalls = [], routes = [], calls = [];
let scene = 1001;
globalThis.wx = {
  getStorageSync: key => stored[key],
  setStorageSync: (key, value) => stored[key] = value,
  getLaunchOptionsSync: () => ({scene}),
  showShareMenu: value => menuCalls.push(value),
  switchTab: value => routes.push(['tab', value.url]),
  navigateTo: value => routes.push(['push', value.url]),
  reLaunch: value => routes.push(['reset', value.url]),
  showModal() {}, showToast() {},
  setNavigationBarTitle() {}, setNavigationBarColor() {},
  setTabBarStyle() {}, setTabBarItem() {}, setBackgroundColor() {}
};
const V = require('../../miniprogram/utils/view');
const Share = require('../../miniprogram/utils/sharing');
const Ambient = require('../../miniprogram/utils/ambient');
const state = {
  user: {id:'u', name:'PRIVATE_PERSON_NAME', username:'PRIVATE_ACCOUNT', avatar:'PRIVATE_AVATAR', dept:'办公室', role:'member'},
  people: [{id:'u', name:'PRIVATE_PERSON_NAME'}], settings:{language:'zh-CN'},
  events: [{id:'e',name:'PRIVATE_EVENT_NAME',date:'2026-10-06'}],
  tasks: [{id:'t',name:'PRIVATE_TASK_NAME',event:'e',owner:'u',receiver:'u',dept:'办公室',due:'2026-10-06T18:00',status:'active'}],
  ledger:[{user:'u',points:7}], notices:[], ranking:[]
};
let cleared = 0;
Object.assign(V.api, {
  token: () => 'PRIVATE_SESSION',
  getState: () => state,
  config: () => ({transport:'direct'}),
  subscribe: () => () => {},
  refresh: async () => state,
  call: async (path, data) => { calls.push([path, data]); return {bound:true}; },
  clear: () => { cleared++; }
});
const mount = (spec, route) => {
  const page = {...spec, data: structuredClone(spec.data || {}), route};
  page.setData = function(data, callback) { Object.assign(this.data, data); callback?.(); };
  return page;
};
const leakAttempt = mount(V.page({
  data:{user:state.user, resultToken:'PRIVATE_INVITE'},
  onShareAppMessage() { return {title:state.tasks[0].name,path:'/pages/auth/index?invite=PRIVATE_INVITE'}; },
  onShareTimeline() { return {query:'reset=PRIVATE_RESET'}; }
}), 'pages/editor/index');
leakAttempt.options = {id:'e',token:'PRIVATE_SESSION',reset:'PRIVATE_RESET',invite:'PRIVATE_INVITE',setup:'PRIVATE_SETUP'};
assert.deepEqual(leakAttempt.onShareAppMessage(), {title:'冯如学媒协作工作台',path:'/pages/home/index',imageUrl:'/images/emblem.png'});
assert.deepEqual(leakAttempt.onShareTimeline(), {title:'冯如学媒协作工作台',query:'share=workbench',imageUrl:'/images/emblem.png'});
assert.ok(!JSON.stringify([leakAttempt.onShareAppMessage(),leakAttempt.onShareTimeline()]).includes('PRIVATE_'));
assert.ok(existsSync('../miniprogram/images/emblem.png'));

const app = JSON.parse(readFileSync('../miniprogram/app.json','utf8'));
const pages = new Map();
globalThis.Page = spec => pages.set(globalThis.pageRoute, spec);
for (const route of app.pages) {
  globalThis.pageRoute = route;
  const file = require.resolve('../../miniprogram/'+route+'.js');
  delete require.cache[file]; require(file);
  const p = mount(pages.get(route), route);
  assert.equal(typeof p.onShareAppMessage, 'function', route+' enables forwarding');
  assert.equal(typeof p.onShareTimeline, 'function', route+' enables timeline');
  p.options = leakAttempt.options; p.data.resultToken = 'PRIVATE_RESET'; p.data.event = state.events[0];
  assert.equal(p.onShareAppMessage().path, '/pages/home/index');
  assert.equal(p.onShareAppMessage().imageUrl, '/images/emblem.png');
  assert.equal(p.onShareTimeline().query, 'share=workbench');
  assert.ok(!JSON.stringify([p.onShareAppMessage(),p.onShareTimeline()]).includes('PRIVATE_'), route+' does not expose private data');
  if (route !== 'pages/home/index') {
    p.onLoad({share:'workbench'}); await p.onShow();
    assert.equal(p.sharedEntry, true, route+' shared links avoid sensitive page initialization');
    assert.equal(routes.at(-1)[1], '/pages/home/index');
  }
}
const home = mount(pages.get('pages/home/index'), 'pages/home/index');
home.onLoad({share:'workbench'}); assert.equal(home.sharedEntry, false);
assert.ok(menuCalls.length >= app.pages.length);
assert.deepEqual(menuCalls[0].menus, ['shareAppMessage','shareTimeline']);
assert.equal(menuCalls[0].withShareTicket, false);
await home.onShow(); assert.equal(home.data.currentUser.name, 'PRIVATE_PERSON_NAME');

scene = 1154;
for (const [route, spec] of pages) {
  const p = mount(spec, route), routeCount = routes.length, menuCount = menuCalls.length, callCount = calls.length;
  p.onLoad({invite:'PRIVATE_INVITE',reset:'PRIVATE_RESET'}); await p.onShow(); await p.onPullDownRefresh?.();
  assert.equal(p.data.sharePreview, true, route+' renders a public timeline preview');
  assert.ok(p.data.sharePublicNote.includes('不包含内部日程或成员信息'));
  assert.ok(!JSON.stringify(p.data).includes('PRIVATE_'), route+' preview has no private data');
  assert.equal(routes.length, routeCount, route+' preview uses no unsupported routing API');
  assert.equal(menuCalls.length, menuCount, route+' preview uses no unsupported sharing API');
  assert.equal(calls.length, callCount, route+' preview performs no authenticated requests');
}
scene = 1001;

const legacyCalls = [];
wx.showShareMenu = value => { legacyCalls.push(value); if(value.menus.includes('shareTimeline')) value.fail?.({errMsg:'unsupported'}); };
Share.enable(); assert.deepEqual(legacyCalls.at(-1).menus, ['shareAppMessage']);

const profile = mount(pages.get('pages/profile/index'), 'pages/profile/index');
profile.onLoad({}); await profile.onShow();
assert.equal(profile.data.user.username, 'PRIVATE_ACCOUNT'); assert.equal(profile.data.points, 7);
profile.go({currentTarget:{dataset:{url:'/pages/profile/settings'}}}); assert.deepEqual(routes.at(-1), ['push','/pages/profile/settings']);
profile.go({currentTarget:{dataset:{url:'/pages/profile/preferences'}}}); assert.deepEqual(routes.at(-1), ['push','/pages/profile/preferences']);
await profile.switchAccount(); assert.equal(calls.at(-1)[0], 'logout'); assert.equal(cleared, 1); assert.deepEqual(routes.at(-1), ['reset','/pages/auth/index']);
await profile.logout(); assert.equal(cleared, 2);
V.api.call = async () => { throw new Error('Network unavailable'); };
await profile.logout(); assert.equal(cleared, 3); assert.deepEqual(routes.at(-1), ['reset','/pages/auth/index']);
const markup = readFileSync('../miniprogram/pages/profile/index.wxml','utf8');
assert.ok(markup.includes('open-type="share"'));
assert.ok(markup.includes('bindtap="switchAccount"'));
assert.ok(!markup.includes('native-account'));
for (const route of app.pages) {
  const markup=readFileSync('../miniprogram/'+route+'.wxml','utf8');
  assert.ok(markup.includes('templates/share-preview.wxml'),route+' has a public preview');
  assert.ok(markup.includes('!sharePreview'),route+' hides normal content in public preview');
  assert.ok(!markup.includes('native-account'),route+' uses the unified My tab');
}
let instance, authReads=0, appTimers=0;
vm.runInNewContext(readFileSync('../miniprogram/app.js','utf8'),{
  App:spec=>instance=spec,wx:{getLaunchOptionsSync:()=>({scene:1154})},
  require:p=>p.includes('recovery')?{bootRepair(){authReads++},capture(){}}:{token(){authReads++;return 'private-token'},config(){authReads++;return {pollMs:30000}}},
  setInterval(){appTimers++;return 1},clearInterval(){}
});
instance.onLaunch({scene:1154,query:{setup:'PRIVATE_SETUP'}});instance.onShow({scene:1154});
assert.equal(authReads,0);assert.equal(appTimers,0);assert.equal(instance.pendingAuth,undefined);
for (const count of [10,32,48,80]) {
  const particles = Ambient.dots(count);
  assert.equal(particles.length, count);
  assert.ok(particles.filter(p => p.x <= 12 || p.x >= 88 || p.y <= 12 || p.y >= 88).length/count >= .9);
  assert.ok(particles.filter(p=>!p.edge).every(p=>p.opacity<.2));
  assert.deepEqual(particles, Ambient.dots(count));
}
home.onUnload(); profile.onUnload();
console.log('PASS: every mini-program page forwards and shares to timeline; safe public cover/title/query, public single-page preview without private data or unsupported APIs, private routes redirect home, unified My/profile and edge-biased particles.');
