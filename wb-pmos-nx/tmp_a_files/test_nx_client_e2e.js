// nx_client 端到端：init → get/post → 验证 200
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const path = require('path');
const nx = require(path.join(__dirname, '..', 'nx-sdenv', 'nx_client.js'));

(async () => {
  console.log('[E2E] start pid=' + process.pid);
  const ctx = await nx.init({ timeout: 45000, log: console.log });
  console.log('[E2E] init OK nsd=' + ctx.nsd);

  // GET 测试
  for (let i = 0; i < 3; i++) {
    const r = await nx.get('/px-gateway/GatewayConfig/getGatewayConfig', ctx, { retries: 3, timeout: 20000 });
    console.log('[E2E] GET#' + i + ' status=' + r.status + ' body.len=' + (r.body || '').length);
  }

  // POST 测试
  for (let i = 0; i < 3; i++) {
    const r = await nx.post('/px-gateway/GatewayConfig/getGatewayConfig', {}, ctx, { retries: 3, timeout: 20000 });
    console.log('[E2E] POST#' + i + ' status=' + r.status + ' body.len=' + (r.body || '').length);
  }
  process.exit(0);
})().catch(e => { console.error('[E2E] FATAL:', e.message); process.exit(1); });
