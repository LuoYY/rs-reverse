// 反编译 base 生成最后一击：在 dynCode 开头注入 Array Proxy 构造追踪。
// base 用索引赋值构造 → 常见模式是 new Array(n) 后逐赋值。
// 捕获 new Array(140-210) 的调用 + 构造栈，定位 base 生成函数。
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[AP] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && !code.includes('__apHook')) {
        console.log('[AP] ★ 截获 dynCode len=' + code.length);
        const hook = `;(function(){
  if(window.__apHook)return; window.__apHook=true;
  var OArray = Array;
  function track(arr, tag){
    try{
      if(arr && arr.length>=140 && arr.length<=210){
        var a = Array.prototype.slice.call(arr);
        if(a.every(function(x){return typeof x==="number"&&x>=0&&x<=255;})){
          window.__apArr = window.__apArr||[];
          window.__apArr.push({tag:tag, len:a.length, head:a.slice(0,20)});
          if(window.__apArr.length>10)window.__apArr.shift();
          window.__apStack = window.__apStack||[];
          window.__apStack.push({tag:tag, stack:new Error().stack});
          if(window.__apStack.length>5)window.__apStack.shift();
        }
      }
    }catch(e){}
  }
  // Proxy Array 构造
  window.Array = new Proxy(OArray, {
    construct(target, args, newTarget){
      var arr = Reflect.construct(target, args, newTarget);
      track(arr, 'new Array');
      return arr;
    },
    apply(target, thisArg, args){
      var arr = Reflect.apply(target, thisArg, args);
      track(arr, 'Array()');
      return arr;
    }
  });
  // hook Array.isArray 等保留
  window.Array.isArray = OArray.isArray;
  window.Array.from = OArray.from;
  // Uint8Array 追踪
  try{
    var OU = window.Uint8Array;
    window.Uint8Array = new Proxy(OU, {
      construct(target, args, newTarget){
        var arr = Reflect.construct(target, args, newTarget);
        track(arr, 'new Uint8Array');
        return arr;
      }
    });
  }catch(e){}
})();
`;
        code = hook + code;
        console.log('[AP] 注入 Array Proxy done');
      }
    } catch (e) { console.log('[AP] hook err:', e.message); }
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
  const getV = (e) => { try { return w.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  const apArr = getV('window.__apArr ? JSON.stringify(window.__apArr) : null');
  const apStack = getV('window.__apStack ? JSON.stringify(window.__apStack) : null');
  const pLen = (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length;
  console.log('[AP] cookie P len:', pLen);
  console.log('[AP] 捕获 140-210B 构造数:', apArr ? JSON.parse(apArr).length : 0);
  if (apArr && apArr !== 'null') {
    JSON.parse(apArr).forEach((x, i) => console.log('[AP]   #' + i + ' ' + x.tag + ' len=' + x.len + ' head=' + x.head.join(',')));
  }
  if (apStack && apStack !== 'null') {
    console.log('[AP] 构造栈:');
    JSON.parse(apStack).forEach((x, i) => {
      if (x.head && x.head.length === 4 && (x.head.join(',') === '59,148,7,120' || x.head.join(',') === '179,0,127,12')) {
        console.log('[AP]   ★ base! ' + x.tag + ' stack: ' + String(x.stack).split('\n').slice(2, 8).join(' | '));
      }
    });
  }
  fs.writeFileSync('/tmp/nx_base_arrayproxy.json', JSON.stringify({ pLen, apArr: apArr ? JSON.parse(apArr) : null, apStack: apStack ? JSON.parse(apStack) : null }, null, 1));
  console.log('[AP] saved /tmp/nx_base_arrayproxy.json done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[AP] FATAL:', e && e.message); process.exit(1); });
