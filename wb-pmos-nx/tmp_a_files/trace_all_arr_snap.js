// 终极：主循环插桩，捕获所有关键数组变量的完整快照（找 59 头 base）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_arr_snap.json');

(async () => {
  console.log('[AS] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !patched) {
        patched = true;
        console.log('[AS] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 aebi 主循环调用完成后捕获所有全局数组
        // dynCode 入口形式：})($_ts.scj,$_ts.aebi);
        const callTail = '})($_ts.scj,$_ts.aebi);';
        const injectTail = `try{var __all=globalThis.__all=[];for(var __k in window){try{var __v=window[__k];if(__v&&__v.length&&__v.length>=130&&__v.length<=230&&Array.isArray(__v)){__all.push({name:__k,len:__v.length,head:Array.from(__v.slice(0,6))});}}catch(e){}}}catch(e){globalThis.__allE=String(e);}` + callTail;
        if (c.indexOf(callTail) >= 0) {
          c = c.split(callTail).join(injectTail);
          console.log('[AS] 尾部捕获 OK');
        } else { console.log('[AS] ✗ 尾部模式未找到'); }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_as_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[AS] hook err:', e.message); }
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
  console.log('[AS] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  const all = ev('typeof __all!=="undefined"?JSON.stringify(__all):null');
  console.log('[AS] __all:', all ? all.slice(0, 800) : 'none');
  fs.writeFileSync(OUT, all || '');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[AS] FATAL:', e && e.message); process.exit(1); });
