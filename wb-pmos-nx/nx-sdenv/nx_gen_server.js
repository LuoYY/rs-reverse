/**
 * nx_gen_server.js — nx 站点本地生成服务（目标环境无 JS 能力时的交付形态）
 *
 * 架构：目标环境（任意语言）→ HTTP 调用本服务 → 拿到该 URL 的完整请求参数
 *       → 目标环境带参数发请求到 pmos.nx
 *
 * 服务能力：
 *   GET /gen?url=<path>     → { cookie, query, queryHdr, headers } 该 URL 的请求参数
 *   GET /status             → 当前会话信息（nsd/cd/keys 摘要/cookie 年龄）
 *   GET /refresh            → 强制刷新会话（新 cookie + keys）
 *
 * cookie 时效 ~90s → 后台每 60s 自动刷新（新 cookie + 新 keys，保持同会话一致）
 * keys 每会话变化 → query 必须用同会话 keys 生成（服务内部处理）
 *
 * 运行：NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_OPTIONS=--dns-result-order=ipv4first
 *       node nx_gen_server.js [port]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const http = require('http');
const path = require('path');
const nx = require('./nx_client');

const PORT = parseInt(process.argv[2] || '9178', 10);
const REFRESH_MS = 60000; // cookie 有效 ~90s，60s 刷新保险
const TARGET = nx.TARGET;
const UA = nx.UA;

let state = null; // { cookie, keys2, keys17, nsd, cd, ts }
let refreshing = false;
let failCount = 0;

async function doInit() {
  const ctx = await nx.init({ log: () => {} });
  state = { cookie: ctx.cookie, keys2: ctx.keys2, keys17: ctx.keys17, nsd: ctx.nsd, cd: ctx.cd, ts: Date.now() };
  failCount = 0;
  console.log('[gen] 会话刷新: nsd=' + ctx.nsd + ' P_len=' + ctx.cookieP.length);
  return state;
}

async function ensureSession() {
  if (state && Date.now() - state.ts < REFRESH_MS) return state;
  if (refreshing) { // 等正在进行的刷新
    while (refreshing) await new Promise(r => setTimeout(r, 200));
    return state;
  }
  refreshing = true;
  try {
    await doInit();
  } catch (e) {
    failCount++;
    console.error('[gen] 刷新失败 #' + failCount + ': ' + e.message);
    // 保留旧会话（若还有效则继续用）
  } finally {
    refreshing = false;
  }
  return state;
}

// 后台定时刷新（失败重试）
setInterval(() => { ensureSession().catch(() => {}); }, REFRESH_MS);

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/gen') {
      // fresh=1 → 强制刷新会话（POST 场景：P cookie 一次性，每次 POST 需新会话）
      const needFresh = u.searchParams.get('fresh') === '1';
      if (needFresh && !refreshing) {
        refreshing = true;
        try { await doInit(); } catch (e) { console.error('[gen] fresh 失败: ' + e.message); }
        refreshing = false;
      }
      const s = await ensureSession();
      if (!s) { send(res, 503, { error: '会话不可用', failCount }); return; }
      const urlPath = (u.searchParams.get('url') || '/').replace(/^https?:\/\/[^/]+/, '');
      if (!urlPath.startsWith('/')) { send(res, 400, { error: 'url 需以 / 开头' }); return; }
      // 双 query（URL query + MurR7rxG header）
      const urlQ = nx.genQuery(urlPath, s.keys2, s.keys17);
      const hdrQ = nx.genQuery(urlPath, s.keys2, s.keys17);
      send(res, 200, {
        url: TARGET + urlPath.replace(/^\//, '') + '?' + urlQ,
        cookie: s.cookie,
        query: urlQ,
        queryHeader: { name: nx.QUERY_PARAM, value: hdrQ },
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json, text/plain, */*',
          'ClientTag': 'OUTNET_BROWSE',
          'CurrentRoute': '/outNet',
          'Origin': 'https://pmos.nx.sgcc.com.cn:10443',
          'Referer': 'https://pmos.nx.sgcc.com.cn:10443/',
          'X-Ticket': 'undefined',
          'X-Token': 'null',
          'Content-Type': 'application/json;charset=UTF-8',
        },
        session: { nsd: s.nsd, ageMs: Date.now() - s.ts },
      });
    } else if (u.pathname === '/status') {
      send(res, 200, { ok: !!state, nsd: state?.nsd, ageMs: state ? Date.now() - state.ts : null, failCount, refreshing });
    } else if (u.pathname === '/refresh') {
      await ensureSession();
      send(res, 200, { ok: !!state, nsd: state?.nsd });
    } else {
      send(res, 404, { error: 'not found' });
    }
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  console.log('[gen] nx 生成服务已启动 :' + PORT + ' (TARGET=' + TARGET + ')');
  console.log('[gen] GET /gen?url=/px-gateway/...  获取请求参数');
  console.log('[gen] GET /status /refresh 管理');
  ensureSession().catch(() => {});
});
