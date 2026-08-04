// POST 诊断 v6：POST 后同 cookie 还能 GET 吗
const nx = require('./nx_client');
(async () => {
  console.log('=== POST v6（POST 后 GET）===');
  const ctx = await nx.init({ log: () => {} });
  const url = '/px-gateway/GatewayConfig/getGatewayConfig';

  // 直接 POST（第一个 query）
  let r = await nx.post(url, '{}', ctx, { retries: 0, log: () => {} });
  console.log(`POST#1: ${r.status}`);

  // POST 后 GET
  r = await nx.get(url, ctx, { retries: 0, log: () => {} });
  console.log(`POST后GET: ${r.status}`);

  // 再 POST
  r = await nx.post(url, '{}', ctx, { retries: 0, log: () => {} });
  console.log(`POST#2: ${r.status}`);

  // 对照：GET#1 后 GET#2
  const ctx2 = await nx.init({ log: () => {} });
  r = await nx.get(url, ctx2, { retries: 0, log: () => {} });
  console.log(`新cookie GET#1: ${r.status}`);
  r = await nx.get(url, ctx2, { retries: 0, log: () => {} });
  console.log(`新cookie GET#2: ${r.status}`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
