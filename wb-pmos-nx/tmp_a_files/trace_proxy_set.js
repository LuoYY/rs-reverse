// 捕获 base 数组完整写入序列：dynCode 开头注入 Proxy，捕获 59 头数组的每次 [i]=v
// 关键：只拦截 length>=140 的数组 set，减少开销
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';
const OUT = path.join(__dirname, 'nx_proxy_set.json');

(async () => {
  console.log('[PS] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && !code.includes('__psHook')) {
        console.log('[PS] ★ 截获 dynCode len=' + code.length);
        const hook = `;(function(){
  if(window.__psHook)return; window.__psHook=true;
  var OArray = Array;
  function wrapSet(arr, tag){
    var hits = window.__psHits = window.__psHits||[];
    return new Proxy(arr, {
      set(t, prop, value){
        if(typeof prop==="string" && /^\\d+$/.test(prop) && t.length>=140 && t.length<=210){
          if(t[0]===59){
            hits.push({tag:tag, i:+prop, v:value, len:t.length, t0:t[0], t1:t[1]});
            if(hits.length>5000)hits.splice(0,2500);
          }
        }
        return Reflect.set(t, prop, value);
      }
    });
  }
  window.Array = new Proxy(OArray, {
    construct(target, args, newTarget){
      var arr = Reflect.construct(target, args, newTarget);
      // 只代理 140-210 长度候选
      if(args.length && args[0]>=140 && args[0]<=210) return wrapSet(arr, 'newArray');
      return arr;
    }
  });
  window.Array.isArray = OArray.isArray;
  window.Array.from = OArray.from;
  window.Array.prototype.push = OArray.prototype.push;
})();
`;
        code = hook + code;
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_proxy_patched.js'), code);
        console.log('[PS] 注入 Proxy hook done');
      }
    } catch (e) { console.log('[PS] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: SDENV_PROXY, consoleConfig: { error: new Function() },
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
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  const n = ev('typeof __psHits!=="undefined"?__psHits.length:0');
  console.log('[PS] 59头写入条数:', n);
  const head = ev('typeof __psHits!=="undefined"?JSON.stringify(__psHits.slice(0,40)):null');
  console.log('[PS] head:', head);
  const tail = ev('typeof __psHits!=="undefined"?JSON.stringify(__psHits.slice(-80)):null');
  console.log('[PS] tail:', tail);
  const full = ev('typeof __psHits!=="undefined"?JSON.stringify(__psHits):null');
  if (full) fs.writeFileSync(OUT, full);
  console.log('[PS] saved', OUT);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[PS] FATAL:', e && e.message); process.exit(1); });
