// 测试多次 init：keys2/keys17 是否跨会话稳定（决定 query 是否需随 cookie 重算）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const nx = require('../nx-sdenv/nx_client');

(async () => {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await nx.init({ log: () => {} });
    samples.push({ k2: ctx.keys2.slice(0, 8), k17: ctx.keys17.slice(0, 8), P: ctx.cookieP.slice(0, 30), nsd: ctx.nsd });
    console.log('[KS] #' + i + ' nsd=' + ctx.nsd + ' k2[0:8]=' + ctx.keys2.slice(0, 8).join(',') + ' k17[0:8]=' + ctx.keys17.slice(0, 8).join(','));
    console.log('[KS]   P head=' + ctx.cookieP.slice(0, 40));
  }
  // 对比稳定性
  const k2Same = samples[0].k2.join(',') === samples[1].k2.join(',');
  const k17Same = samples[0].k17.join(',') === samples[1].k17.join(',');
  console.log('[KS] k2 跨会话稳定:', k2Same);
  console.log('[KS] k17 跨会话稳定:', k17Same);
  process.exit(0);
})().catch(e => { console.error('[KS] FATAL:', e.message); process.exit(1); });
