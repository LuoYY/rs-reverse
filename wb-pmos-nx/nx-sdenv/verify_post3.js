// POST 诊断 v3：init → GET → POST 顺序
const nx = require('./nx_client');
(async () => {
  console.log('=== POST v3（init→GET→POST）===');
  const ctx = await nx.init({ log: () => {} });
  console.log('init OK');

  const url = '/px-gateway/GatewayConfig/getGatewayConfig';

  // 先 GET
  let r = await nx.get(url, ctx, { retries: 0, log: () => {} });
  console.log(`GET: ${r.status}`);

  // 再 POST（不带 Origin）
  r = await nx.post(url, '{}', ctx, { retries: 0, log: () => {} });
  console.log(`POST 无Origin: ${r.status} ${r.body.substring(0, 60)}`);

  // 再 POST（带 Content-Type 显式）
  r = await nx.post(url, '{}', ctx, { retries: 0, log: () => {}, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
  console.log(`POST 带CT: ${r.status} ${r.body.substring(0, 60)}`);

  // 新 init 后直接 POST
  console.log('\n重新 init 直接 POST...');
  const ctx2 = await nx.init({ log: () => {} });
  r = await nx.post(url, '{}', ctx2, { retries: 0, log: () => {} });
  console.log(`POST 新cookie直接: ${r.status} ${r.body.substring(0, 60)}`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
