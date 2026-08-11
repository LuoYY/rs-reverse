// 测试 nx_client.init 当前可用性（sdenv cookie + forkKeys）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const path = require('path');
const nx = require(path.join(__dirname, '..', 'nx-sdenv', 'nx_client.js'));

(async () => {
  console.log('[TC] start pid=' + process.pid);
  const t0 = Date.now();
  try {
    const ctx = await nx.init({ timeout: 45000, log: console.log });
    console.log('[TC] OK nsd=' + ctx.nsd + ' keys2=' + ctx.keys2.slice(0, 4).join(',') + ' keys17=' + ctx.keys17.slice(0, 4).join(','));
    console.log('[TC] cookie len=' + ctx.cookie.length);
    console.log('[TC] elapsed=' + (Date.now() - t0) + 'ms');
    process.exit(0);
  } catch (e) {
    console.log('[TC] FAIL: ' + e.message);
    console.log('[TC] elapsed=' + (Date.now() - t0) + 'ms');
    process.exit(1);
  }
})();
