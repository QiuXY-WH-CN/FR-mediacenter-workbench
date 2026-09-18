const defaults = require('../config');

let state = null;
let inFlight = null;
let generation = 0;
let initializedCloud = '';
const listeners = new Set();

function config() {
  return Object.assign({}, defaults, wx.getStorageSync('fr.connection') || {});
}

function token() {
  return wx.getStorageSync('fr.token') || '';
}

function saveToken(value) {
  if (value) wx.setStorageSync('fr.token', value);
  else wx.removeStorageSync('fr.token');
}

function clear() {
  generation += 1;
  state = null;
  inFlight = null;
  saveToken('');
  listeners.forEach((fn) => {
    try { fn(null); } catch (e) {}
  });
}

function notify(next) {
  listeners.forEach((fn) => {
    try { fn(next); } catch (e) {}
  });
}

function directRequest(base, payload) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: base + '/mini/api',
      method: 'POST',
      data: payload,
      header: { 'content-type': 'application/json' },
      timeout: 15000,
      success: (r) => resolve(r.data),
      fail: () => reject(new Error('无法连接本机。开发者工具可用 127.0.0.1；手机需使用同一 Wi-Fi 下电脑的局域网地址，或配置云入口。'))
    });
  });
}

async function cloudRequest(c, payload) {
  if (!c.cloudEnv) throw new Error('尚未配置云开发环境，请先使用本机连接');
  if (!wx.cloud) throw new Error('当前微信版本不支持云开发');
  if (initializedCloud !== c.cloudEnv) {
    wx.cloud.init({ env: c.cloudEnv, traceUser: false });
    initializedCloud = c.cloudEnv;
  }
  const response = await wx.cloud.callFunction({
    name: c.cloudFunction,
    data: payload,
    config: { env: c.cloudEnv }
  });
  return response.result;
}

async function call(path, data) {
  const c = config();
  const payload = { path: path, token: token() };
  if (data !== undefined) payload.data = data;

  let result;
  if (c.transport === 'cloud') {
    result = await cloudRequest(c, payload);
  } else {
    const base = String(c.directBaseUrl || '').replace(/\/$/, '');
    if (!/^https?:\/\//.test(base)) throw new Error('请设置有效的服务器地址');
    result = await directRequest(base, payload);
  }

  if (!result || typeof result.status !== 'number') throw new Error('服务器响应异常');
  if (result.status >= 400) {
    if (result.status === 401) clear();
    const err = new Error((result.body && result.body.error) || '操作失败');
    err.status = result.status;
    throw err;
  }

  if (result.sessionToken) saveToken(result.sessionToken);
  if (path === 'logout') clear();
  return result.body;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function refresh(force = false) {
  if (!token()) return null;
  if (inFlight && !force) return inFlight;

  const current = ++generation;
  const work = call('state')
    .then((next) => {
      if (current === generation) {
        state = next;
        notify(next);
      }
      return next;
    })
    .finally(() => {
      if (inFlight === work) inFlight = null;
    });
  inFlight = work;
  return work;
}

async function mutate(path, data) {
  const result = await call(path, data);
  await refresh(true);
  return result;
}

async function info() {
  return call('info');
}

function setConnection(next) {
  clear();
  wx.setStorageSync('fr.connection', Object.assign({}, defaults, next));
}

module.exports = {
  call,
  refresh,
  mutate,
  subscribe,
  config,
  setConnection,
  clear,
  token,
  getState: () => state,
  info
};
