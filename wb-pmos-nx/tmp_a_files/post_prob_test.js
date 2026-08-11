// POST 概率性统计：连续 10 次手动 POST（每次新 query），统计成功率
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const nx = require('../nx-sdenv/nx_client');
const { httpPost } = require('../nx-sdenv/proxy_http');
const urlPath = '/px-gateway/GatewayConfig/getGatewayConfig';
const body = { pageSize: 10, pageNum: 1 };

(async () => {
  const ctx = await nx.init({ log: () => {} });
  let ok = 0;
  for (let i = 0; i < 10; i++) {
    const urlQ = nx.genQuery(urlPath, ctx.keys2, ctx.keys17);
    const hdrQ = nx.genQuery(urlPath, ctx.keys2, ctx.keys17);
    const full = nx.TARGET + urlPath.replace(/^\//, '') + '?' + urlQ;
    const h = { Cookie: ctx.cookie, 'Content-Type': 'application/json;charset=UTF-8', [nx.QUERY_PARAM]: hdrQ };
    Object.assign(h, { 'Accept': 'application/json, text/plain, */*', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet',
      'Origin': 'https://pmos.nx.sgcc.com.cn:10443', 'Referer': 'https://pmos.nx.sgcc.com.cn:10443/', 'X-Ticket': 'undefined', 'X-Token': 'null' });
    const r = await httpPost(full, JSON.stringify(body), { userAgent: nx.UA, timeout: 25000, headers: h });
    if (r.status === 200) ok++;
    process.stdout.write(r.status === 200 ? '.' : 'x');
  }
  console.log('\n[PT] POST 成功率: ' + ok + '/10');
  process.exit(0);
})().catch(e => { console.error('[PT] FATAL:', e.message); process.exit(1); });
