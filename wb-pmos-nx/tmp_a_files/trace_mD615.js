// 插桩 _$mD[615] 调用：捕获每次 (ez, pl) 与 _$kt 前后变化
// 目标：还原 base 编码区的每个值如何写入
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
  console.log('[M6] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[M6] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 插桩 _$mD[615](_$kt,_$ez,_$pL)
        const t1 = '_$mD[615](_$kt,_$ez,_$pL);';
        if (c.indexOf(t1) >= 0) {
          const inj = `try{window.__mD=window.__mD||[];var __bb=Array.isArray(_$kt)?Array.from(_$kt.slice(0,230)):null;var __ee=(typeof _$ez!=="undefined")?_$ez:null;var __pp=(typeof _$pL!=="undefined")?_$pL:null;}catch(__e){}` + t1 + `try{var __aa=Array.isArray(_$kt)?Array.from(_$kt.slice(0,230)):null;window.__mD.push({ez:__ee,pl:__pp,before:__bb,after:__aa});if(window.__mD.length>3000)window.__mD.splice(0,1500);}catch(__e){window.__mE=String(__e);}`;
          c = c.split(t1).join(inj);
          console.log('[M6] _$mD[615] 插桩 OK');
        } else console.log('[M6] ✗ _$mD[615](_$kt..) 未找到');
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_m615_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[M6] hook err:', e.message); }
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
  const n = ev('typeof __mD!=="undefined"?__mD.length:0');
  console.log('[M6] 调用数:', n, 'err:', ev('typeof __mE!=="undefined"?__mE:null'));
  const full = ev('typeof __mD!=="undefined"?JSON.stringify(__mD):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_mD_calls.json'), full);
  console.log('[M6] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[M6] FATAL:', e && e.stack); process.exit(1); });
