// 测试连续多次 init 的可靠性和耗时（验证常驻服务可行性）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const nx = require('../nx-sdenv/nx_client');

(async () => {
  let ok = 0, fail = 0;
  const times = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    try {
      const ctx = await nx.init({ log: () => {} });
      const dt = Date.now() - t0;
      times.push(dt);
      ok++;
      console.log('[IR] #' + i + ' init 耗时 ' + dt + 'ms P len=' + ctx.cookieP.length);
    } catch (e) {
      fail++;
      console.log('[IR] #' + i + ' FAIL: ' + e.message);
    }
  }
  console.log('[IR] 成功 ' + ok + '/' + (ok + fail) + ' 平均耗时 ' + Math.round(times.reduce((a, b) => a + b, 0) / times.length) + 'ms');
  process.exit(0);
})().catch(e => { console.error('[IR] FATAL:', e.message); process.exit(1); });
