// POST 诊断 v4：验证顺序影响（GET 后 POST 的 query 是否绑定 GET）
const nx = require('./nx_client');
const { httpPost } = require('./proxy_http');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
(async () => {
  console.log('=== POST v4 ===');
  const ctx = await nx.init({ log: () => {} });
  const url = '/px-gateway/GatewayConfig/getGatewayConfig';
  const path2 = TARGET + url.replace(/^\//, '');

  // 1. init 后直接 GET
  let q = nx.genQuery(url, ctx.keys2, ctx.keys17);
  let r = await httpPost(path2, '{}', { userAgent: nx.UA, timeout: 15000, headers: { Cookie: ctx.cookie, Accept: '*/*', [nx.QUERY_PARAM]: q } });
  console.log(`[直接POST q#1] ${r.status}`);

  // 2. 生成新 query 再 POST
  q = nx.genQuery(url, ctx.keys2, ctx.keys17);
  r = await httpPost(path2, '{}', { userAgent: nx.UA, timeout: 15000, headers: { Cookie: ctx.cookie, Accept: '*/*', [nx.QUERY_PARAM]: q } });
  console.log(`[POST q#2] ${r.status}`);

  // 3. GET 一次
  const rg = await nx.get(url, ctx, { retries: 0, log: () => {} });
  console.log(`[GET] ${rg.status}`);

  // 4. GET 后新 query POST
  q = nx.genQuery(url, ctx.keys2, ctx.keys17);
  r = await httpPost(path2, '{}', { userAgent: nx.UA, timeout: 15000, headers: { Cookie: ctx.cookie, Accept: '*/*', [nx.QUERY_PARAM]: q } });
  console.log(`[GET后POST q#new] ${r.status}`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
