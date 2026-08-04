// 稳定验证：一次 init + 多轮 GET（同 cookie 新 query）
const nx = require('./nx_client');
(async () => {
  console.log('=== nx 客户端稳定性验证 ===');
  const ctx = await nx.init({ log: () => {} });
  console.log('init OK, cookie:', ctx.cookie.substring(0, 40) + '...');
  let ok = 0, fail = 0;
  const paths = [
    '/px-gateway/GatewayConfig/getGatewayConfig',
    '/px-gateway/GatewayConfig/getGatewayConfig',
    '/px-gateway/monitor/monitorDataList',
    '/px-gateway/GatewayConfig/getGatewayConfig',
    '/px-gateway/monitor/monitorDataList',
  ];
  for (let i = 0; i < paths.length; i++) {
    const r = await nx.get(paths[i], ctx, { retries: 2, log: () => {} });
    const s = r.status === 200 ? '200 OK' : (r.status + ' ' + (r.error || ''));
    if (r.status === 200) ok++; else fail++;
    console.log(`[${i + 1}/5] ${paths[i].split('/').pop()}: ${s} body.len=${r.body.length}`);
  }
  console.log(`\n结果: ${ok}/5 通过`);
  console.log(ok === 5 ? '★★★★★ 稳定性验证通过！' : '✗ 有失败');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
