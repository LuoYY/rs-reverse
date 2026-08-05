// Hook 所有数组构造：找 basearr（59/179 头）数组的出现时刻
// 用 Array.prototype.push/slice 等 hook + 索引赋值检测
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[ARR] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[ARR] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 dynCode IIFE 顶部注入数组 hook
        const head = '(function(_$$5,_$lP){';
        if (c.indexOf(head) >= 0) {
          const inject = `(function(_$$5,_$lP){var __origPush=Array.prototype.push;Array.prototype.push=function(){var r=__origPush.apply(this,arguments);try{globalThis.__baseArr=globalThis.__baseArr||[];if(this.length>100&&(this[0]===59||this[0]===179)){if(globalThis.__baseArr.length<3)globalThis.__baseArr.push(Array.from(this).slice(0,40));}}catch(e){globalThis.__arrErr=String(e)};return r;};`;
          c = c.replace(head, inject);
          console.log('[ARR] Array.push hook 注入 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_arr_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[ARR] hook err:', e.message); }
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
  const log = evalV('typeof __baseArr!=="undefined"?JSON.stringify(__baseArr):null');
  console.log('[ARR] __baseArr:', log);
  console.log('[ARR] __arrErr:', evalV('typeof __arrErr!=="undefined"?__arrErr:null'));
  console.log('[ARR] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[ARR] FATAL:', e && e.message); process.exit(1); });
