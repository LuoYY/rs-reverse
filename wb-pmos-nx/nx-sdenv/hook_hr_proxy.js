// Hook _\$hr 数组索引赋值（basearr 构造）：用 Proxy 监控 + 捕获构造堆栈
// 在 dynCode 的 _\$hr=[] 处替换为 Proxy 包装数组
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[PX] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[PX] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // _\$hr=[] 初始化处 → Proxy 包装
        // 但 _\$hr 在 _\$nq 函数内（var _$hr）。dispatcher 用 _\$hr 引用数组。
        // 更简单：hook _\$c4 主循环，检测 _\$hr 何时变为 59 头数组
        // 在 IIFE 头部注入：监控 window.__hrWatch
        const head = '(function(_$$5,_$lP){';
        const inject = `(function(_$$5,_$lP){var __proxyCache=new WeakMap();var __mkProxy=function(arr){if(__proxyCache.has(arr))return __proxyCache.get(arr);var p=new Proxy(arr,{set:function(t,k,v){var r=Reflect.set(t,k,v);try{if(t.length>100&&(t[0]===59||t[0]===179)){globalThis.__hrWatch=globalThis.__hrWatch||[];if(globalThis.__hrWatch.length<2){globalThis.__hrWatch.push({head:Array.from(t).slice(0,30),len:t.length,key:String(k)});globalThis.__hrStack=new Error().stack;}}}catch(e){}return r;},push:function(v){var r=Array.prototype.push.apply(this,arguments);try{if(this.length>100&&(this[0]===59||this[0]===179)){globalThis.__hrWatch=globalThis.__hrWatch||[];if(globalThis.__hrWatch.length<2){globalThis.__hrWatch.push({head:Array.from(this).slice(0,30),len:this.length});}}}catch(e){}return r;}});__proxyCache.set(arr,p);return p;};var __origArr=Array;Array=function(){var a=__origArr.apply(this,arguments);return __mkProxy(a);};Array.prototype=__origArr.prototype;`;
        c = c.replace(head, inject);
        console.log('[PX] Proxy 注入 OK');
        fs.writeFileSync('/tmp/nx_dynCode_px_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[PX] hook err:', e.message); }
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
  const log = evalV('typeof __hrWatch!=="undefined"?JSON.stringify(__hrWatch):null');
  console.log('[PX] __hrWatch:', log);
  const stack = evalV('typeof __hrStack!=="undefined"?__hrStack:null');
  console.log('[PX] stack:', stack ? stack.split('\n').slice(0, 15).join('\n') : '');
  console.log('[PX] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[PX] FATAL:', e && e.message); process.exit(1); });
