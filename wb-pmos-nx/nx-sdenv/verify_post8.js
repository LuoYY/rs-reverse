// POST 诊断 v8：统计 POST 成功率（同 cookie 多次）
const nx = require('./nx_client');
const { httpPost } = require('./proxy_http');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
(async () => {
  console.log('=== POST v8（成功率统计）===');
  const ctx = await nx.init({ log: () => {} });
  const url = '/px-gateway/GatewayConfig/getGatewayConfig';
  const path2 = TARGET + url.replace(/^\//, '');
  let ok = 0;
  for (let i = 0; i < 10; i++) {
    const q = nx.genQuery(url, ctx.keys2, ctx.keys17);
    const r = await httpPost(path2, '{}', { userAgent: nx.UA, timeout: 12000, headers: { Cookie: ctx.cookie, Accept: '*/*', [nx.QUERY_PARAM]: q } });
    if (r.status === 200) ok++;
    process.stdout.write(r.status + ' ');
  }
  console.log(`\nPOST 成功率: ${ok}/10`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
