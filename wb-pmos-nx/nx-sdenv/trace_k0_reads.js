// 插桩追踪 _$k0[144]/[126]/[68]/[2]/[203]/[278]（base[22:29] 来源索引）的读取点
// 捕获读取时的 opcode 上下文，定位 base[22:29] 生成指令
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[K0] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[K0] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在主循环 opcode 取值点后插桩：检测 _$k0[144] 等读取
        const target = '_$pW=_$bk[_$g6++];if(_$pW<1732)';
        if (c.indexOf(target) >= 0) {
          const inject = `_$pW=_$bk[_$g6++];try{var __idx=[144,126,68,2,203,278];var __cur=__idx.indexOf(_$g6);if(__cur>=0&&!_$oJ){globalThis.__k0hits=globalThis.__k0hits||[];if(globalThis.__k0hits.length<20){globalThis.__k0hits.push({idx:__idx[__cur],pc:_$g6,op:_$pW});}}}catch(e){globalThis.__k0e=String(e)}if(_$pW<1732)`;
          c = c.replace(target, inject);
          console.log('[K0] 插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_k0_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[K0] hook err:', e.message); }
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
  const log = evalV('typeof __k0hits!=="undefined"?JSON.stringify(__k0hits):null');
  console.log('[K0] __k0hits:', log);
  console.log('[K0] __k0e:', evalV('typeof __k0e!=="undefined"?__k0e:null'));
  console.log('[K0] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[K0] FATAL:', e && e.message); process.exit(1); });
