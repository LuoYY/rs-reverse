// 确认 dynCode IIFE 主体执行路径：插桩 _$dp=[] 初始化 + 环境检测 + basearr 构造函数池
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[IIF] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[IIF] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 1. IIFE 主体 _$dp=[] 初始化
        const dpInit = '_$dp=[],_$pH=new _$eQ(),_$g0=_$pH,_$hh=_$pH,_$hr=[];';
        if (c.indexOf(dpInit) >= 0) {
          c = c.replace(dpInit, 'globalThis.__dpInit=true;' + dpInit);
          console.log('[IIF] _$dp 初始化插桩 OK');
        } else { console.log('[IIF] ✗ _$dp 初始化未找到'); }
        // 2. _$er 主循环
        const erLoop = 'else while( !_$hP(0))_$er(_$hr);';
        if (c.indexOf(erLoop) >= 0) {
          c = c.replace(erLoop, 'else while( !_$hP(0)){globalThis.__erCalls=(globalThis.__erCalls||0)+1;_$er(_$hr);}');
          console.log('[IIF] _$er 循环插桩 OK');
        }
        // 3. _$n3 分支
        const n3branch = 'if(_$_T)_$n3(_$hr,_$$v,true);';
        if (c.indexOf(n3branch) >= 0) {
          c = c.replace(n3branch, 'if(_$_T){globalThis.__n3Hit=true;_$n3(_$hr,_$$v,true);}');
          console.log('[IIF] _$n3 分支插桩 OK');
        }
        // 4. 环境检测字符串解码器 _$kZ（v2 命中 561 次，确认执行）
        const kzDef = 'function _$kZ(_$aq){var _$_T,_$hr,_$kx;_$_T=_$aq.split';
        if (c.indexOf(kzDef) >= 0) {
          c = c.replace(kzDef, 'function _$kZ(_$aq){globalThis.__kzCalls=(globalThis.__kzCalls||0)+1;var _$_T,_$hr,_$kx;_$_T=_$aq.split');
          console.log('[IIF] _$kZ 插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_iife_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[IIF] hook err:', e.message); }
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
  console.log('[IIF] __dpInit:', evalV('typeof __dpInit!=="undefined"?__dpInit:null'));
  console.log('[IIF] __erCalls:', evalV('typeof __erCalls!=="undefined"?__erCalls:null'));
  console.log('[IIF] __n3Hit:', evalV('typeof __n3Hit!=="undefined"?__n3Hit:null'));
  console.log('[IIF] __kzCalls:', evalV('typeof __kzCalls!=="undefined"?__kzCalls:null'));
  console.log('[IIF] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[IIF] FATAL:', e && e.message); process.exit(1); });
