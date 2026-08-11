// 捕获真实 _$av 和 _$a8 值（在 _$iE 调用时）
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
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        let c = code;
        const headPat = 'function _$iE(_$aq,_$k6,_$hZ,_$nD,_$oA,_$jM,_$hP){var _$_T,_$pE,_$dt;';
        if (c.indexOf(headPat) >= 0) {
          const inj = headPat + `try{window.__avCap=window.__avCap||[];window.__avCap.push({avT:typeof _$av,avS:String(_$av).slice(0,30),a8T:typeof _$a8,a8S:String(_$a8).slice(0,30),aNT:typeof _$aN,izT:typeof _$iz});}catch(__e){window.__avE=String(__e);}`;
          c = c.split(headPat).join(inj);
          console.log('[AV] 捕获 OK');
        }
        code = c;
      }
    } catch (e) { console.log('[AV] hook err:', e.message); }
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
  console.log('[AV] 捕获:', ev('typeof __avCap!=="undefined"?JSON.stringify(__avCap):null'));
  console.log('[AV] err:', ev('typeof __avE!=="undefined"?__avE:null'));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[AV] FATAL:', e && e.stack); process.exit(1); });
