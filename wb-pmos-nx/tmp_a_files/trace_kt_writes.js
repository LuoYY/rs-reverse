// 终极：hook _$kt（base 数组）的每次写入，捕获完整构造过程
// 在 _$hB/_$eb/_$op/_$mX 等编码函数中注入记录
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
  console.log('[KT] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[KT] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 _$hB 函数开头注入：记录每次 base 写入
        // _$hB(_$aq,_$_T) 编码后写入 _$kt[_$cV++]
        // 在 _$g1() 调用点注入（_$g1 返回 _$cV 游标）
        const g1Target = 'function _$g1(){_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
        if (c.indexOf(g1Target) >= 0) {
          const inject = 'function _$g1(){try{window.__ktW=window.__ktW||[];window.__ktW.push({cV:_$cV,kt:Array.isArray(_$kt)?Array.from(_$kt.slice(0,Math.min(_$kt.length,200))):null});if(window.__ktW.length>3000)window.__ktW.splice(0,1500);}catch(__e){window.__ktE=String(__e);}_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
          c = c.split(g1Target).join(inject);
          console.log('[KT] _$g1 注入 OK');
        } else { console.log('[KT] ✗ _$g1 未找到'); }
        fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_kt_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[KT] hook err:', e.message); }
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
  const n = ev('typeof __ktW!=="undefined"?__ktW.length:0');
  console.log('[KT] 写入记录数:', n);
  console.log('[KT] err:', ev('typeof __ktE!=="undefined"?__ktE:null'));
  const head = ev('typeof __ktW!=="undefined"?JSON.stringify(__ktW.slice(0,10)):null');
  console.log('[KT] head:', head);
  const tail = ev('typeof __ktW!=="undefined"?JSON.stringify(__ktW.slice(-10)):null');
  console.log('[KT] tail:', tail);
  const full = ev('typeof __ktW!=="undefined"?JSON.stringify(__ktW):null');
  if (full) fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_writes.json', full);
  console.log('[KT] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[KT] FATAL:', e && e.message); process.exit(1); });
