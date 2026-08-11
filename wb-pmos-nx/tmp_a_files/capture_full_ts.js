// 捕获完整 $_ts（含 cp）—— base 生成核心输入
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
  console.log('[TS] pid=' + process.pid);
  const origRun = vm.runInContext;
  let tsSnap = null;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (ctx && ctx.$_ts && !tsSnap) {
        const ts = ctx.$_ts;
        tsSnap = {};
        for (const k of Object.keys(ts)) {
          const v = ts[k];
          if (Array.isArray(v)) tsSnap[k] = { t: 'arr', len: v.length, head: JSON.stringify(v.slice(0, 3)) };
          else if (typeof v === 'string') tsSnap[k] = { t: 'str', len: v.length, head: v.slice(0, 30) };
          else if (typeof v === 'number') tsSnap[k] = { t: 'num', v };
          else if (typeof v === 'function') tsSnap[k] = { t: 'fn' };
          else tsSnap[k] = { t: typeof v, head: String(v).slice(0, 50) };
        }
        console.log('[TS] $_ts 字段:', Object.keys(tsSnap).join(','));
        // 保存完整（关键字段）
        const out = {
          keys: Object.keys(ts),
          cp: Array.isArray(ts.cp) ? ts.cp : ts.cp,
          scj: ts.scj, aebi: ts.aebi,
          nsd: ts.nsd, cd: typeof ts.cd === 'string' ? ts.cd : String(ts.cd || ''),
        };
        fs.writeFileSync(path.join(__dirname, 'nx_ts_full.json'), JSON.stringify(out, (k, v) => {
          if (Array.isArray(v) && v.length > 5000) return v.slice(0, 5000);
          return v;
        }));
        console.log('[TS] saved nx_ts_full.json, cp type:', Array.isArray(ts.cp) ? 'arr' + ts.cp.length : typeof ts.cp);
      }
    } catch (e) { console.log('[TS] hook err:', e.message); }
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
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[TS] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=([^;]*)/) || [''])[1] ? 'ok' : 'none');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[TS] FATAL:', e && e.stack); process.exit(1); });
