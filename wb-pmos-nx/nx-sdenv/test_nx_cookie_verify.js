// 验证 sdenv 原样 cookie 打 API 是否 200（对照），确认链路可用。
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const nx = require('./nx_client');
const { httpGet } = require('./proxy_http');

(async () => {
  console.log('[VF] 初始化 sdenv...');
  const ctx = await nx.init({ timeout: 50000, log: (m) => console.log('  ' + m) });
  console.log('[VF] cookie: ' + ctx.cookie.slice(0, 60) + '...');
  console.log('[VF] keys2 前8: ' + ctx.keys2.slice(0, 8).join(','));
  const API = '/px-common-authcenter/auth/v2/captcha/get';
  for (let i = 0; i < 3; i++) {
    const q = nx.genQuery(API, ctx.keys2, ctx.keys17);
    const rr = await httpGet(nx.TARGET + API, {
      userAgent: nx.UA, timeout: 20000,
      headers: { Cookie: ctx.cookie, Accept: '*/*', [nx.QUERY_PARAM]: q },
    });
    console.log('[VF] #' + i + ' → status=' + rr.status + (rr.error ? ' err=' + rr.error : ''));
    await new Promise(r => setTimeout(r, 1200));
  }
  process.exit(0);
})().catch(e => { console.error('[VF] FATAL:', e && e.message); process.exit(1); });
