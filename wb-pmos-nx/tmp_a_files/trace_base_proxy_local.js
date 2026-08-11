// 本地固定版本：Proxy 全量监控 59 头数组写入
// 记录：数组首次变 59 头后的每次 [i]=v（含调用栈定位写入 opcode）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_base_proxy_local.json');

(async () => {
  console.log('[BP] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && !code.includes('__bpInit')) {
        console.log('[BP] ★ 截获 dynCode len=' + code.length);
        const hook = `;(function(){
  if(window.__bpInit)return; window.__bpInit=true;
  var OArray = Array;
  var log = window.__bpHits = [];
  function makeProxied(t){
    return new Proxy(t, {
      set(target, prop, value){
        if(typeof prop==="string" && /^\\d+$/.test(prop)){
          var i=+prop;
          var isBase = target[0]===59 || (i===0 && value===59);
          if(isBase && target.length<=210){
            log.push({i:i, v:value, len:target.length, st:new Error().stack.split("\\n").slice(1,4).join("|")});
            if(log.length>30000)log.splice(0,10000);
          }
        }
        return Reflect.set(target, prop, value);
      }
    });
  }
  window.Array = new Proxy(OArray, {
    construct(target, args){
      var a = Reflect.construct(target, args);
      // 只在首次写入 59 时才转 Proxy 太迟，这里直接包所有数组（有开销但本地固定环境可控）
      return makeProxied(a);
    }
  });
  window.Array.isArray = OArray.isArray;
  window.Array.from = OArray.from;
})();
`;
        code = hook + code;
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_bp_patched.js'), code);
        console.log('[BP] 注入 done');
      }
    } catch (e) { console.log('[BP] hook err:', e.message); }
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
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[BP] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  const n = ev('typeof __bpHits!=="undefined"?__bpHits.length:0');
  console.log('[BP] __bpHits:', n);
  const head = ev('typeof __bpHits!=="undefined"?JSON.stringify(__bpHits.slice(0,20)):null');
  console.log('[BP] head:', head);
  const tail = ev('typeof __bpHits!=="undefined"?JSON.stringify(__bpHits.slice(-60)):null');
  console.log('[BP] tail:', tail);
  const full = ev('typeof __bpHits!=="undefined"?JSON.stringify(__bpHits):null');
  if (full) fs.writeFileSync(OUT, full);
  console.log('[BP] saved', OUT);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[BP] FATAL:', e && e.message); process.exit(1); });
