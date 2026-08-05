// 验证 IIFE 是否执行：在最开头 + _\$\$dp 初始化 + 主循环 return 插桩
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[HED] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[HED] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 1. IIFE 最开头标记
        const headPattern = '(function(_$$5,_$lP){var _$la=0;';
        if (c.indexOf(headPattern) >= 0) {
          c = c.replace(headPattern, '(function(_$$5,_$lP){globalThis.__IIFE_HEAD=1;var _$la=0;');
          console.log('[HED] IIFE 头插桩 OK');
        } else { console.log('[HED] ✗ IIFE 头模式未找到: ' + c.slice(0, 80)); }
        // 2. _\$\$dp 初始化
        const dpInit = '_$dp=[],_$pH=new _$eQ(),_$g0=_$pH,_$hh=_$pH,_$hr=[];';
        if (c.indexOf(dpInit) >= 0) {
          c = c.replace(dpInit, 'try{globalThis.__DP_1=1;}catch(e){}' + dpInit + 'try{globalThis.__DP_2=1;globalThis.__DP_HR=_$hr;}catch(e){}');
          console.log('[HED] _$dp 插桩 OK');
        }
        // 3. 主循环 return
        const ret = 'return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};';
        if (c.indexOf(ret) >= 0) {
          c = c.replace(ret, 'try{globalThis.__RET_1=1;globalThis.__RET_HR=Array.from(_$hr).slice(0,60);globalThis.__RET_PH=_$pH&&_$pH._$ky?Object.keys(_$pH._$ky):null;}catch(e){globalThis.__RET_ERR=String(e);}' + ret);
          console.log('[HED] return 插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_head_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[HED] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
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
  console.log('[HED] __IIFE_HEAD:', evalV('typeof __IIFE_HEAD!=="undefined"?__IIFE_HEAD:null'));
  console.log('[HED] __DP_1:', evalV('typeof __DP_1!=="undefined"?__DP_1:null'));
  console.log('[HED] __DP_2:', evalV('typeof __DP_2!=="undefined"?__DP_2:null'));
  console.log('[HED] __DP_HR:', evalV('typeof __DP_HR!=="undefined"?JSON.stringify(__DP_HR):null'));
  console.log('[HED] __RET_1:', evalV('typeof __RET_1!=="undefined"?__RET_1:null'));
  console.log('[HED] __RET_HR:', evalV('typeof __RET_HR!=="undefined"?JSON.stringify(__RET_HR):null'));
  console.log('[HED] __RET_PH:', evalV('typeof __RET_PH!=="undefined"?JSON.stringify(__RET_PH):null'));
  console.log('[HED] __RET_ERR:', evalV('typeof __RET_ERR!=="undefined"?__RET_ERR:null'));
  console.log('[HED] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[HED] FATAL:', e && e.message); process.exit(1); });
