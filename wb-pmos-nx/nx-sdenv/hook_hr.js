// Hook _$hr 数组（basearr 载体）：检测 59/179 头数组出现
// 在 dynCode 中 hook Array.prototype.push + 索引赋值代理
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[HR] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[HR] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 IIFE 顶部注入 Proxy 监控所有数组的 push/slice/索引（检测 basearr）
        const head = '(function(_$$5,_$lP){';
        const inject = `(function(_$$5,_$lP){var __origPush=Array.prototype.push,__origSlice=Array.prototype.slice;var __check=function(arr){try{if(arr&&arr.length>100&&(arr[0]===59||arr[0]===179)){globalThis.__baseArr=globalThis.__baseArr||[];if(globalThis.__baseArr.length<2){globalThis.__baseArr.push({head:Array.prototype.slice.call(arr,0,30),len:arr.length});globalThis.__baseArrStack=new Error().stack;} }}catch(e){}};Array.prototype.push=function(){var r=__origPush.apply(this,arguments);__check(this);return r;};Array.prototype.slice=function(){var r=__origSlice.apply(this,arguments);if(arguments.length&&this.length>100)__check(r);return r;};`;
        c = c.replace(head, inject);
        console.log('[HR] hook 注入 OK');
        fs.writeFileSync('/tmp/nx_dynCode_hr_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[HR] hook err:', e.message); }
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
  console.log('[HR] __baseArr:', log);
  const stack = evalV('typeof __baseArrStack!=="undefined"?__baseArrStack:null');
  console.log('[HR] stack:', stack ? stack.substring(0, 600) : '');
  console.log('[HR] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[HR] FATAL:', e && e.message); process.exit(1); });
