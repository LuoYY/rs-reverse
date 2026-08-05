// 插桩 _$nq 入口 + _$c4 入口，确认 basearr 构造调用链
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[NQ] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[NQ] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 1. 插桩 _$nq 入口
        const nqDef = 'function _$nq(_$aq,_$_T,_$k6){var _$hZ,_$nD,_$oA,_$jM,_$o8,_$oz,_$oQ,_$kC,_$el';
        if (c.indexOf(nqDef) >= 0) {
          c = c.replace(nqDef, nqDef + ';try{globalThis.__nqHit=(globalThis.__nqHit||0)+1;globalThis.__nqAq=typeof _$aq==="string"?"str:"+_$aq.slice(0,300):"type:"+typeof _$aq;}catch(e){globalThis.__nqErr=String(e)}');
          console.log('[NQ] _$nq 入口插桩 OK');
        } else { console.log('[NQ] ✗ _$nq 模式未找到'); }
        // 2. 插桩 _$c4 入口（dispatcher 被调用次数）
        const c4Def = 'function _$c4(_$cg,_$ez,_$pL,_$gc,_$pb,_$nx,_$cQ){';
        if (c.indexOf(c4Def) >= 0) {
          c = c.replace(c4Def, c4Def + 'try{globalThis.__c4Hit=(globalThis.__c4Hit||0)+1;}catch(e){}');
          console.log('[NQ] _$c4 入口插桩 OK');
        }
        // 3. IIFE 头
        c = c.replace('(function(_$$5,_$lP){var _$la=0;', '(function(_$$5,_$lP){globalThis.__iifeHit=1;var _$la=0;');
        fs.writeFileSync('/tmp/nx_dynCode_nq_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[NQ] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() },
  });
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
  const evalV = (expr) => { try { return w.eval(expr); } catch (e) { return 'ERR:' + e.message; } };
  console.log('[NQ] __iifeHit:', evalV('typeof __iifeHit!=="undefined"?__iifeHit:null'));
  console.log('[NQ] __c4Hit:', evalV('typeof __c4Hit!=="undefined"?__c4Hit:null'));
  console.log('[NQ] __nqHit:', evalV('typeof __nqHit!=="undefined"?__nqHit:null'));
  console.log('[NQ] __nqAq:', evalV('typeof __nqAq!=="undefined"?__nqAq:null'));
  console.log('[NQ] __nqErr:', evalV('typeof __nqErr!=="undefined"?__nqErr:null'));
  console.log('[NQ] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[NQ] FATAL:', e && e.message); process.exit(1); });
