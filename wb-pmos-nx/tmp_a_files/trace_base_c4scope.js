// 终极插桩：主循环 opcode 取值点，在 c4 作用域内检测所有数组变量的 59 头
// 记录：哪个数组变量、何时变 59 头、每次 [i] 写入值
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_base_c4scope.json');

(async () => {
  console.log('[CS] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !patched) {
        patched = true;
        console.log('[CS] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 主循环取值点：_$pW=_$bk[_$g6++];
        const target = '_$pW=_$bk[_$g6++];';
        if (c.indexOf(target) >= 0) {
          const inject = `_$pW=_$bk[_$g6++];try{var __arrs={m:typeof _$m$!=="undefined"&&_$m$?_$m$:null,e5:typeof _$e5!=="undefined"&&_$e5?_$e5:null,ez:typeof _$ez!=="undefined"&&_$ez?_$ez:null,py:typeof _$py!=="undefined"&&_$py?_$py:null};for(var __k in __arrs){var __a=__arrs[__k];if(__a&&__a.length>=140&&__a.length<=220&&__a[0]===59){globalThis.__cs=globalThis.__cs||{};globalThis.__cs[__k]=globalThis.__cs[__k]||{len:__a.length,first:Array.from(__a.slice(0,6)),lastI:0};if(__a.length!==globalThis.__cs[__k].len){globalThis.__cs[__k].snap=Array.from(__a);}}if(__a&&__a.length>=140&&__a.length<=220&&__a[0]===59&&globalThis.__csFull===undefined){globalThis.__csSnap=Array.from(__a);globalThis.__csFull=true;}}}catch(__e){if(!globalThis.__csE)globalThis.__csE=String(__e);}`;
          // 只对 m/e5/ez/py 检测太受限；更简单：全局搜 var 声明中 140+ 数组不现实。
          // 用最简单：每次 opcode 检查 4 个候选数组是否 59 头
          c = c.split(target).join(inject);
          console.log('[CS] 主循环插桩 OK');
        } else { console.log('[CS] ✗ 主循环模式未找到'); }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_cs_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[CS] hook err:', e.message); }
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
  console.log('[CS] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[CS] err:', ev('typeof __csE!=="undefined"?__csE:null'));
  console.log('[CS] csFull:', ev('typeof __csFull!=="undefined"?__csFull:null'));
  const cs = ev('typeof __cs!=="undefined"?JSON.stringify(__cs):null');
  console.log('[CS] __cs:', cs ? cs.slice(0, 500) : 'none');
  const snap = ev('typeof __csSnap!=="undefined"?JSON.stringify(__csSnap):null');
  console.log('[CS] snap:', snap ? snap.slice(0, 300) : 'none');
  if (snap) fs.writeFileSync(OUT, snap);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[CS] FATAL:', e && e.message); process.exit(1); });
