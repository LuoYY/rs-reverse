// 在 dynCode 截获时 dump 完整 $_ts（含 cp）
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
  console.log('[T2] pid=' + process.pid);
  const origRun = vm.runInContext;
  let dynSeen = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      // 每次执行都检查 $_ts（记录所有快照）
      if (ctx && ctx.$_ts) {
        const keys = Object.keys(ctx.$_ts);
        const hasCp = 'cp' in ctx.$_ts;
        if (hasCp && !dynSeen) {
          dynSeen = true;
          const ts = ctx.$_ts;
          console.log('[T2] $_ts keys:', keys.join(','));
          const out = {};
          for (const k of keys) {
            const v = ts[k];
            if (Array.isArray(v)) out[k] = v;
            else out[k] = v;
          }
          // JSON 安全（截断大数组）
          fs.writeFileSync(path.join(__dirname, 'nx_ts_full2.json'), JSON.stringify(out, (k, v) => {
            if (Array.isArray(v) && v.length > 8000) return v.slice(0, 8000);
            if (typeof v === 'function') return 'fn';
            return v;
          }));
          console.log('[T2] cp len:', Array.isArray(ts.cp) ? ts.cp.length : typeof ts.cp, 'scj:', Array.isArray(ts.scj) ? ts.scj.length : typeof ts.scj, 'aebi:', Array.isArray(ts.aebi) ? ts.aebi.length : typeof ts.aebi);
          console.log('[T2] saved nx_ts_full2.json');
        }
      }
    } catch (e) {}
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
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  console.log('[T2] done, cp 捕获:', dynSeen);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[T2] FATAL:', e && e.stack); process.exit(1); });
