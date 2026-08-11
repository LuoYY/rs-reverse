// 捕获运行时 _$mD[615] 的函数体（base 编码器实现）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[M5] pid=' + process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[M5] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 op=1464 前注入：捕获 _$mD[615] 函数体 + 参数
        const t1464 = 'if(_$pW===1464){_$mD[615](_$kt,_$ez,_$pL);}';
        const capture = `try{if(window.__fn===undefined){window.__fn=typeof _$mD[615]==="function"?_$mD[615].toString():String(_$mD[615]);window.__args=[typeof _$kt!=="undefined"?String(_$kt).slice(0,50):"-",typeof _$ez!=="undefined"?_$ez:"-",typeof _$pL!=="undefined"?_$pL:"-"];}}catch(__e){window.__fnE=String(__e);}`;
        if (c.indexOf(t1464) >= 0) {
          c = c.split(t1464).join(capture + t1464);
          console.log('[M5] 插桩 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_m615b_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[M5] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
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
  const fn = ev('typeof __fn!=="undefined"?__fn:null');
  console.log('[M5] _$mD[615] 函数体 (len=' + (fn ? fn.length : 0) + '):');
  console.log('[M5]', fn ? fn.slice(0, 1500) : 'null');
  console.log('[M5] err:', ev('typeof __fnE!=="undefined"?__fnE:null'));
  console.log('[M5] args:', ev('typeof __args!=="undefined"?JSON.stringify(__args):null'));
  fs.writeFileSync(path.join(__dirname, 'nx_mD615_fn.txt'), fn || '');
  console.log('[M5] saved nx_mD615_fn.txt');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[M5] FATAL:', e && e.stack); process.exit(1); });
