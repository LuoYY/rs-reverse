// 捕获 _$kZ（hex 解码器）的完整输入输出：验证环境检测与 base 锚点关系
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[KZ] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[KZ] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 插桩 _$kZ：记录所有 hex 输入（唯一值）
        const kzDef = 'function _$kZ(_$aq){var _$_T,_$hr,_$kx;_$_T=_$aq.split';
        if (c.indexOf(kzDef) >= 0) {
          c = c.replace(kzDef, 'function _$kZ(_$aq){try{globalThis.__kzAll=globalThis.__kzAll||{};globalThis.__kzAll[String(_$aq)]=(globalThis.__kzAll[String(_$aq)]||0)+1;if(Object.keys(globalThis.__kzAll).length>60){}}catch(e){}var _$_T,_$hr,_$kx;_$_T=_$aq.split');
          console.log('[KZ] _$kZ 插桩 OK');
        }
        // 插桩 _$pg（调用 _$kZ 的环境检测函数）
        const pgDef = 'function _$pg(){return _$kZ(_$oP[118]);}';
        if (c.indexOf(pgDef) >= 0) {
          c = c.replace(pgDef, 'function _$pg(){try{globalThis.__pgCalls=(globalThis.__pgCalls||0)+1;globalThis.__pgIn=_$oP[118];}catch(e){}return _$kZ(_$oP[118]);}');
          console.log('[KZ] _$pg 插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_kz_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[KZ] hook err:', e.message); }
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
  console.log('[KZ] __pgCalls:', evalV('typeof __pgCalls!=="undefined"?__pgCalls:null'));
  console.log('[KZ] __pgIn:', evalV('typeof __pgIn!=="undefined"?__pgIn:null'));
  const all = evalV('typeof __kzAll!=="undefined"?JSON.stringify(__kzAll):null');
  console.log('[KZ] __kzAll:', all);
  console.log('[KZ] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[KZ] FATAL:', e && e.message); process.exit(1); });
