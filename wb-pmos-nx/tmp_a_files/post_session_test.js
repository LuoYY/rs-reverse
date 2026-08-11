// 测试：POST 失败后刷新会话（新 cookie）再试，看成功率
// 假设：POST 绑定"挑战页会话"，每次 POST 用刚生成的挑战页 cookie 成功率更高
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const nx = require('../nx-sdenv/nx_client');
const { httpPost } = require('../nx-sdenv/proxy_http');
const urlPath = '/px-gateway/GatewayConfig/getGatewayConfig';
const body = { pageSize: 10, pageNum: 1 };

async function postWith(ctx) {
  const urlQ = nx.genQuery(urlPath, ctx.keys2, ctx.keys17);
  const hdrQ = nx.genQuery(urlPath, ctx.keys2, ctx.keys17);
  const full = nx.TARGET + urlPath.replace(/^\//, '') + '?' + urlQ;
  const h = { Cookie: ctx.cookie, 'Content-Type': 'application/json;charset=UTF-8', [nx.QUERY_PARAM]: hdrQ };
  Object.assign(h, { 'Accept': 'application/json, text/plain, */*', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet',
    'Origin': 'https://pmos.nx.sgcc.com.cn:10443', 'Referer': 'https://pmos.nx.sgcc.com.cn:10443/', 'X-Ticket': 'undefined', 'X-Token': 'null' });
  return httpPost(full, JSON.stringify(body), { userAgent: nx.UA, timeout: 25000, headers: h });
}

(async () => {
  // 每组：新 init → 立即 POST
  let ok = 0;
  for (let i = 0; i < 8; i++) {
    const ctx = await nx.init({ log: () => {} });
    const r = await postWith(ctx);
    if (r.status === 200) ok++;
    process.stdout.write(r.status === 200 ? '.' : 'x');
  }
  console.log('\n[SE] 每会话1次POST 成功率: ' + ok + '/8');
  // 对照：同会话连发
  const ctx2 = await nx.init({ log: () => {} });
  ok = 0;
  for (let i = 0; i < 8; i++) {
    const r = await postWith(ctx2);
    if (r.status === 200) ok++;
    process.stdout.write(r.status === 200 ? '.' : 'x');
  }
  console.log('\n[SE] 同会话连发8次 成功率: ' + ok + '/8');
  process.exit(0);
})().catch(e => { console.error('[SE] FATAL:', e.message); process.exit(1); });
