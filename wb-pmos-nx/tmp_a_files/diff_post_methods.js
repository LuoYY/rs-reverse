// 对比 nx.post (200) vs 手动 httpPost (412) 的精确差异
// 关键假设：headers 顺序 / Content-Type / UA / body 格式
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const nx = require('../nx-sdenv/nx_client');
const { httpPost } = require('../nx-sdenv/proxy_http');
const urlPath = '/px-gateway/GatewayConfig/getGatewayConfig';
const body = { pageSize: 10, pageNum: 1 };

(async () => {
  const ctx = await nx.init({ log: () => {} });
  // 1. 先手动 POST（预期可能 412）
  const urlQ1 = nx.genQuery(urlPath, ctx.keys2, ctx.keys17);
  const hdrQ1 = nx.genQuery(urlPath, ctx.keys2, ctx.keys17);
  const full1 = nx.TARGET + urlPath.replace(/^\//, '') + '?' + urlQ1;
  const h1 = { Cookie: ctx.cookie, 'Content-Type': 'application/json;charset=UTF-8', [nx.QUERY_PARAM]: hdrQ1 };
  Object.assign(h1, { 'Accept': 'application/json, text/plain, */*', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet',
    'Origin': 'https://pmos.nx.sgcc.com.cn:10443', 'Referer': 'https://pmos.nx.sgcc.com.cn:10443/', 'X-Ticket': 'undefined', 'X-Token': 'null' });
  const r1 = await httpPost(full1, JSON.stringify(body), { userAgent: nx.UA, timeout: 25000, headers: h1 });
  console.log('[DF] 手动 POST:', r1.status);
  // 2. nx.post（已知可能 200）
  const r2 = await nx.post(urlPath, body, ctx, { retries: 2, log: () => {} });
  console.log('[DF] nx.post:', r2.status);
  // 3. 若 nx.post 200，再手动 POST 同会话（看是否绑定）
  if (r2.status === 200) {
    const urlQ3 = nx.genQuery(urlPath, ctx.keys2, ctx.keys17);
    const hdrQ3 = nx.genQuery(urlPath, ctx.keys2, ctx.keys17);
    const full3 = nx.TARGET + urlPath.replace(/^\//, '') + '?' + urlQ3;
    const h3 = { Cookie: ctx.cookie, 'Content-Type': 'application/json;charset=UTF-8', [nx.QUERY_PARAM]: hdrQ3 };
    Object.assign(h3, { 'Accept': 'application/json, text/plain, */*', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet',
      'Origin': 'https://pmos.nx.sgcc.com.cn:10443', 'Referer': 'https://pmos.nx.sgcc.com.cn:10443/', 'X-Ticket': 'undefined', 'X-Token': 'null' });
    const r3 = await httpPost(full3, JSON.stringify(body), { userAgent: nx.UA, timeout: 25000, headers: h3 });
    console.log('[DF] nx.post 后手动 POST:', r3.status);
  }
  process.exit(0);
})().catch(e => { console.error('[DF] FATAL:', e.message); process.exit(1); });
