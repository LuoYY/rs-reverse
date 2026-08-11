// 捕获 _$kB 完整内容（所有字符串池的来源）
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
  console.log('[KB] pid=' + process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[KB] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 _$k0=_$nP(_$ez) 之后捕获 _$kB（在 _$kB 初始化后）
        // _$kB 从 _$k0 取值（pc=1527 附近），找一个稳定的捕获点
        // 用 _$g1（cV 游标函数）作为触发点，但更精确：捕获 _$k0 构建后的 _$kB
        const target = 'function _$g1(){_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
        if (c.indexOf(target) >= 0) {
          const inj = 'function _$g1(){try{if(typeof _$kB!=="undefined"&&Array.isArray(_$kB)&&_$kB.length>100){window.__kb={kB:Array.from(_$kB.slice(0,400)),ll:typeof _$ll!=="undefined"?_$ll:null,f:typeof _$f$!=="undefined"?_$f$:null,oP:typeof _$oP!=="undefined"?_$oP:null,_L:typeof _$_L!=="undefined"?_$_L:null,_q:typeof _$$q!=="undefined"?_$$q:null,_3:typeof _$_3!=="undefined"?_$_3:null,_M:typeof _$$M!=="undefined"?_$$M:null,lC:typeof _$lC!=="undefined"?_$lC:null,lc:typeof _$lc!=="undefined"?_$lc:null,b1:typeof _$b1!=="undefined"?_$b1:null};}}catch(__e){window.__kbE=String(__e);}_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
          c = c.split(target).join(inj);
          console.log('[KB] _$g1 注入 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_kb_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[KB] hook err:', e.message); }
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
  const n = ev('typeof __kb!=="undefined"?__kb.length:0');
  console.log('[KB] 捕获数:', n, 'err:', ev('typeof __kbE!=="undefined"?__kbE:null'));
  const full = ev('typeof __kb!=="undefined"?JSON.stringify(__kb):null');
  if (full) {
    fs.writeFileSync(path.join(__dirname, 'nx_kB_capture.json'), full);
    const d = JSON.parse(full);
    const k = d[0];
    console.log('[KB] kB len:', k.kB.length);
    console.log('[KB] ll:', k.ll, 'f:', k.f, 'oP:', k.oP);
    console.log('[KB] _L:', k._L, '_q:', k._q, '_3:', k._3, '_M:', k._M);
    console.log('[KB] lC:', k.lC, 'lc:', k.lc, 'b1:', k.b1);
    // kB[0..15] 摘要
    console.log('[KB] kB[0:15]:', k.kB.slice(0, 15).map(v => typeof v === 'string' ? 's:' + v.slice(0, 15) : v).join(' | '));
  }
  console.log('[KB] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[KB] FATAL:', e && e.stack); process.exit(1); });
