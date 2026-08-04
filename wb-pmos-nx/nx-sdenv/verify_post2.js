// POST 诊断 v2：加 Origin/Referer 头
const nx = require('./nx_client');
const { httpPost } = require('./proxy_http');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';

(async () => {
  console.log('=== POST v2 验证 ===');
  const ctx = await nx.init({ log: () => {} });
  console.log('init OK');

  const url = '/px-gateway/GatewayConfig/getGatewayConfig';
  const path2 = TARGET + url.replace(/^\//, '');

  // 1. 无额外头（现状）
  let r = await nx.post(url, '{}', ctx, { retries: 0, log: () => {} });
  console.log(`[现状] POST: ${r.status} ${r.body.substring(0, 50)}`);

  // 2. 加 Origin/Referer
  const q = nx.genQuery(url, ctx.keys2, ctx.keys17);
  r = await httpPost(path2, '{}', {
    userAgent: nx.UA,
    timeout: 15000,
    headers: {
      Cookie: ctx.cookie, Accept: '*/*',
      'Origin': 'https://pmos.nx.sgcc.com.cn:10443',
      'Referer': 'https://pmos.nx.sgcc.com.cn:10443/',
      'Content-Type': 'application/json;charset=UTF-8',
      [nx.QUERY_PARAM]: q,
    },
  });
  console.log(`[+Origin/Referer] POST: ${r.status} ${r.body.substring(0, 50)}`);

  // 3. GET 对照
  r = await nx.get(url, ctx, { retries: 0, log: () => {} });
  console.log(`[对照 GET] ${r.status} ${r.body.substring(0, 50)}`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
