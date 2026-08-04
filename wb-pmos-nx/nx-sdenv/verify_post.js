// 验证 POST 请求（诊断 412）
const nx = require('./nx_client');
(async () => {
  console.log('=== POST 验证 ===');
  const ctx = await nx.init({ log: () => {} });
  console.log('init OK');

  // 试不同 POST
  const tries = [
    { url: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{}' },
    { url: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{"captchaType":"blockPuzzle"}' },
    { url: '/px-gateway/monitor/monitorDataList', body: '{}' },
  ];
  for (const t of tries) {
    const r = await nx.post(t.url, t.body, ctx, { retries: 2, log: () => {} });
    console.log(`${t.url.split('/').pop()} POST: ${r.status} body.len=${r.body.length} ${r.body.substring(0, 60)}`);
  }
  // 对比：同 URL 的 GET
  const r = await nx.get('/px-gateway/GatewayConfig/getGatewayConfig', ctx, { retries: 2, log: () => {} });
  console.log(`\n对照 GET: ${r.status} body.len=${r.body.length}`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
