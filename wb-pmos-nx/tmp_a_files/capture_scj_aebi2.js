// 捕获 scj/aebi：hook vm.runInContext 的参数（dynCode 执行时 $_ts 已有值）
// 关键：dynCode 执行前 $_ts.scj/aebi 已设置（外层 JS 先设置再执行 dynCode）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[SC] pid=%d start', process.pid);
  let captured = null;
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && !captured) {
        // dynCode 执行前，ctx 里应该有 $_ts（含 scj/aebi）
        if (ctx && ctx.$_ts) {
          captured = {
            scj: ctx.$_ts.scj !== undefined ? JSON.parse(JSON.stringify(ctx.$_ts.scj)) : null,
            aebi: ctx.$_ts.aebi !== undefined ? ctx.$_ts.aebi : null,
            nsd: ctx.$_ts.nsd, cd: ctx.$_ts.cd,
          };
          console.log('[SC] ★ 捕获 scj/aebi! scj=' + (captured.scj ? JSON.stringify(captured.scj).slice(0, 100) : 'null') + ' aebi=' + (captured.aebi ? 'len=' + captured.aebi.length : 'null'));
          if (captured.aebi && captured.aebi.length) {
            console.log('[SC] aebi[0]:', JSON.stringify(captured.aebi[0]).slice(0, 80));
            console.log('[SC] aebi[1] len:', captured.aebi[1] ? captured.aebi[1].length : 'null');
          }
          fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_scj_aebi2.json', JSON.stringify(captured));
        }
      }
    } catch (e) { console.log('[SC] hook err:', e.message.slice(0, 80)); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  console.log('[SC] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[SC] captured:', captured ? 'yes' : 'no');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[SC] FATAL:', e && e.message); process.exit(1); });
