import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DAY = 86400000;
const GET_PATHS = new Set(['info', 'state', 'members']);
const POST_PATHS = new Set([
  'setup', 'login', 'register', 'recover', 'logout', 'password',
  'events/create', 'events/update', 'events/reschedule',
  'tasks/create', 'tasks/action', 'templates/save',
  'members/update', 'invite', 'reset-link'
]);
const WECHAT_PATHS = new Set(['wechat/login', 'wechat/bind', 'wechat/unbind', 'wechat/status']);
const ALLOWED = new Set([...GET_PATHS, ...POST_PATHS, ...WECHAT_PATHS, 'sop', 'health']);

const json = (status, body, extra = {}) => new Response(JSON.stringify({ status, body, ...extra }), {
  status: 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

const sha256 = value => createHash('sha256').update(value).digest('hex');
const now = () => Date.now();

function normalizePath(input) {
  if (typeof input !== 'string') return '';
  const value = input.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!value || value.length > 120 || !/^[a-zA-Z0-9/_.-]+$/.test(value)) return '';
  return value;
}

function loadBridgeConfig(root) {
  const file = path.join(root, '.local', 'mini-server.json');
  try {
    const cfg = JSON.parse(readFileSync(file, 'utf8'));
    if (cfg && typeof cfg.appid === 'string' && typeof cfg.bridgeSecret === 'string' && cfg.bridgeSecret.length >= 32) {
      return { appid: cfg.appid, bridgeSecret: cfg.bridgeSecret };
    }
  } catch {
    // Missing or invalid file is handled by the caller.
  }
  return null;
}

function ensureBindings(db) {
  db.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS wechat_bindings (
      hash TEXT PRIMARY KEY,
      user TEXT NOT NULL UNIQUE,
      created INTEGER NOT NULL
    )
  `);
}

function identityHash(identity) {
  return sha256(`wechat:${identity.appid}:${identity.openid}`);
}

function userForToken(db, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = sha256(token);
  return db.sqlite.prepare(
    `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user
     WHERE sessions.hash = ? AND sessions.expires > ?`
  ).get(hash, now()) || null;
}

function userForIdentity(db, identity) {
  const binding = db.sqlite.prepare('SELECT user FROM wechat_bindings WHERE hash = ?').get(identityHash(identity));
  if (!binding) return null;
  return db.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(binding.user) || null;
}

function createMiniSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  const hash = sha256(token);
  db.sqlite.prepare('DELETE FROM sessions WHERE expires < ?').run(now());
  db.sqlite.prepare('INSERT INTO sessions (hash, user, expires) VALUES (?, ?, ?)').run(hash, userId, now() + 7 * DAY);
  return token;
}

function verifyCloud(headers, rawBody, bridge, nonceStore) {
  const stamp = headers.get('x-fr-cloud-time');
  const nonce = headers.get('x-fr-cloud-nonce');
  const provided = headers.get('x-fr-cloud-signature');
  if (!stamp || !nonce || !provided) return { status: 400, error: '缺少云桥接签名信息' };
  if (!bridge) return { status: 503, error: '云桥接尚未配置，请先填写 .local/mini-server.json 并重启本机服务' };

  const stampMs = Number(stamp);
  if (!Number.isFinite(stampMs) || Math.abs(now() - stampMs) > 5 * 60 * 1000) {
    return { status: 403, error: '云桥接签名已过期' };
  }
  if (!/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(provided)) {
    return { status: 403, error: '云桥接签名格式无效' };
  }
  if (nonceStore.has(nonce)) return { status: 403, error: '重复请求已被拒绝' };

  const expected = createHmac('sha256', bridge.bridgeSecret).update(`${stamp}\n${nonce}\n${rawBody}`).digest('hex');
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { status: 403, error: '云桥接签名校验失败' };
  }

  // Bound the store size and reject replays within the allowed clock window.
  const expiry = now() + 5 * 60 * 1000;
  nonceStore.set(nonce, expiry);
  for (const [key, value] of nonceStore) if (value <= now()) nonceStore.delete(key);
  return { ok: true };
}

async function handleWechat(path, payload, identity, token, db) {
  if (path === 'wechat/login') {
    if (!identity) return json(403, { error: '微信登录仅支持云函数通道' });
    const user = userForIdentity(db, identity);
    if (!user) return json(403, { error: '当前微信尚未绑定学媒账号，请先使用账号密码登录后在“我的”中绑定' });
    if (user.status !== 'active') return json(403, { error: user.status === 'pending' ? '账号等待负责人审核' : '账号已停用' });
    return json(200, { ok: true }, { sessionToken: createMiniSession(db, user.id) });
  }

  if (!token) return json(401, { error: '请先登录' });
  const user = userForToken(db, token);
  if (!user) return json(401, { error: '登录已过期，请重新登录' });
  if (user.status !== 'active') return json(403, { error: user.status === 'pending' ? '账号等待负责人审核' : '账号已停用' });

  if (path === 'wechat/status') {
    return json(200, { bound: !!db.sqlite.prepare('SELECT hash FROM wechat_bindings WHERE user = ?').get(user.id) });
  }
  if (path === 'wechat/bind') {
    if (!identity) return json(403, { error: '微信绑定仅支持云函数通道' });
    const hash = identityHash(identity);
    const existing = db.sqlite.prepare('SELECT user FROM wechat_bindings WHERE hash = ?').get(hash);
    if (existing && existing.user !== user.id) return json(409, { error: '该微信已绑定其他学媒账号' });
    db.sqlite.prepare('DELETE FROM wechat_bindings WHERE user = ?').run(user.id);
    db.sqlite.prepare('INSERT INTO wechat_bindings (hash, user, created) VALUES (?, ?, ?)').run(hash, user.id, now());
    return json(200, { bound: true });
  }
  if (path === 'wechat/unbind') {
    db.sqlite.prepare('DELETE FROM wechat_bindings WHERE user = ?').run(user.id);
    return json(200, { bound: false });
  }
  return json(404, { error: '接口不存在' });
}

export function createMiniGateway({ worker, DB, root = process.cwd(), bridgeConfig = null }) {
  ensureBindings(DB);
  const bridge = bridgeConfig || loadBridgeConfig(root);
  const nonceStore = new Map();

  return async function miniApi(req, env) {
    if (req.method !== 'POST') return json(405, { error: '仅支持 POST 请求' });

    const rawBody = await req.text();
    if (rawBody.length > 100000) return json(413, { error: '请求内容过大' });

    let payload;
    try {
      payload = JSON.parse(rawBody);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
    } catch {
      return json(400, { error: '请求格式不正确' });
    }

    const path = normalizePath(payload.path);
    if (!path || !ALLOWED.has(path)) return json(404, { error: '接口不存在' });

    // Cloud bridge requests carry an HMAC signature; only then is _identity trusted.
    const hasCloudHeaders = Boolean(req.headers.get('x-fr-cloud-time') || req.headers.get('x-fr-cloud-nonce') || req.headers.get('x-fr-cloud-signature'));
    let identity = null;
    if (hasCloudHeaders) {
      const verified = verifyCloud(req.headers, rawBody, bridge, nonceStore);
      if (!verified.ok) return json(verified.status, { error: verified.error });
      identity = payload._identity;
      if (!identity || typeof identity !== 'object' || identity.appid !== bridge.appid || typeof identity.openid !== 'string' || !identity.openid) {
        return json(403, { error: '微信身份信息无效' });
      }
    }

    if (path === 'health') return json(200, { ok: true });

    if (path === 'sop') {
      const sopToken = typeof payload.token === 'string' ? payload.token : '';
      const sopUser = userForToken(DB, sopToken);
      if (!sopUser || sopUser.status !== 'active') return json(401, { error: '请先登录' });
      try {
        const docs = await worker.fetch(new Request('http://mini.local/sop-docs.json', { headers: { Cookie: `fr_session_v2=${sopToken}` } }), env);
        return json(docs.status, await docs.json());
      } catch {
        return json(502, { error: '知识库暂时不可用' });
      }
    }

    if (WECHAT_PATHS.has(path)) {
      return handleWechat(path, payload, identity, typeof payload.token === 'string' ? payload.token : '', DB);
    }

    const token = typeof payload.token === 'string' ? payload.token : '';
    const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : {};
    const isGet = GET_PATHS.has(path);
    const headers = { 'Origin': 'http://mini.local', 'X-FR-Request': '1' };
    if (token) headers['Cookie'] = `fr_session_v2=${token}`;
    if (!isGet) headers['Content-Type'] = 'application/json';

    const request = new Request(`http://mini.local/api/${path}`, {
      method: isGet ? 'GET' : 'POST',
      headers,
      body: isGet ? undefined : JSON.stringify(data)
    });

    let response;
    try {
      response = await worker.fetch(request, env);
    } catch {
      return json(502, { error: '本机服务暂时不可用' });
    }

    let body;
    try {
      body = await response.json();
    } catch {
      body = { error: '本机服务响应异常' };
    }

    const result = { status: response.status, body };
    const setCookie = response.headers.get('set-cookie') || '';
    const match = setCookie.match(/fr_session_v2=([a-f0-9]{64})/);
    if (match) result.sessionToken = match[1];
    return json(response.status, body, match ? { sessionToken: match[1] } : {});
  };
}

