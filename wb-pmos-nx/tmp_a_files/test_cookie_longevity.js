// 测试 sdenv 生成 cookie 的时效性：延迟重放，找有效期边界
// 用 nx_client.js 的 init 生成 cookie，然后每隔一段时间重放，看何时失效
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const nx = require('../nx-sdenv/nx_client');
const { httpGet } = require('../nx-sdenv/proxy_http');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const QUERY_PARAM = 'MurR7rxG';
const UA = nx.UA;

(async () => {
  console.log('[LT] 初始化（sdenv 生成 cookie + deriveKeys）...');
  const t0 = Date.now();
  const ctx = await nx.init({ log: (m) => console.log('[LT] ' + m) });
  console.log('[LT] init 耗时 ' + (Date.now() - t0) + 'ms, P len=' + ctx.cookieP.length);
  const urlPath = '/px-gateway/GatewayConfig/getGatewayConfig';

  // 立即验证
  function bizHeaders() {
    return {
      'Accept': 'application/json, text/plain, */*',
      'ClientTag': 'OUTNET_BROWSE',
      'CurrentRoute': '/outNet',
      'Origin': 'https://pmos.nx.sgcc.com.cn:10443',
      'Referer': 'https://pmos.nx.sgcc.com.cn:10443/',
      'X-Ticket': 'undefined',
      'X-Token': 'null',
    };
  }
  async function probe(tag) {
    const urlQ = nx.genQuery(urlPath, ctx.keys2, ctx.keys17);
    const hdrQ = nx.genQuery(urlPath, ctx.keys2, ctx.keys17);
    const full = TARGET + urlPath + '?' + urlQ;
    const r = await httpGet(full, { userAgent: UA, timeout: 20000, headers: { Cookie: ctx.cookie, [QUERY_PARAM]: hdrQ, ...bizHeaders() } });
    return r.status;
  }

  const s0 = await probe('t0');
  console.log('[LT] t0 (立即): ' + s0);

  // 每隔 30s 重放
  for (let i = 1; i <= 10; i++) {
    await new Promise(r => setTimeout(r, 30000));
    const s = await probe('t' + i);
    console.log('[LT] t+' + i * 30 + 's: ' + s);
    if (s !== 200) { console.log('[LT] ★ cookie 失效于 ' + i * 30 + 's'); break; }
  }
  process.exit(0);
})().catch(e => { console.error('[LT] FATAL:', e.message); process.exit(1); });
