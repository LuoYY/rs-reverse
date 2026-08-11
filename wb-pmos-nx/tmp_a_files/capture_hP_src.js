// 捕获被调用的 hP 函数源码（Function.toString），Go 重现环境
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

(async () => {
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[HS] ★ 截获 dynCode len=' + code.length);
        let c = code;
        const cSPat = 'function _$cS(_$aq,_$_T,_$hr,_$kx){var _$md,_$hi,_$pc,_$oi,_$ms,_$_R,_$fZ,_$gx,_$gB,_$pC,_$f1,_$fD,_$ax,_$jb,_$p2;_$gx=_$aq._$gS';
        if (c.indexOf(cSPat) >= 0) {
          const inj = 'function _$cS(_$aq,_$_T,_$hr,_$kx){var __oipc=function(){try{if(_$pc===_$hP&&typeof _$oi!=="undefined"){window.__hps=window.__hps||{};window.__hps[_$oi]=typeof _$hP[_$oi]==="function"?String(_$hP[_$oi]).slice(0,300):("obj:"+typeof _$hP[_$oi]);}}catch(e){}};var _$md,_$hi,_$pc,_$oi,_$ms,_$_R,_$fZ,_$gx,_$gB,_$pC,_$f1,_$fD,_$ax,_$jb,_$p2;_$gx=_$aq._$gS';
          c = c.split(cSPat).join(inj);
          c = c.split('_$pc[_$oi](').join('__oipc(),_$pc[_$oi](');
          console.log('[HS] 插桩 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_hps_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[HS] hook err:', e.message); }
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
  const hps = ev('typeof __hps!=="undefined"?JSON.stringify(__hps):null');
  console.log('[HS] hP 函数源码:', hps ? hps.slice(0, 400) : 'null');
  if (hps) fs.writeFileSync(path.join(__dirname, 'nx_hP_src.json'), hps);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[HS] FATAL:', e && e.stack); process.exit(1); });
