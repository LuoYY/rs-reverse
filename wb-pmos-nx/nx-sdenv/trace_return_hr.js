// 插桩 dynCode return 点：dump _$hr（basearr 结果数组）+ _$pH 结构
// 关键：dynCode IIFE 返回 {_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF}，_$dE 就是 basearr
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[RET] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[RET] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // ★ 插桩 return 点：dump _$hr（basearr）+ _$pH._$ky（属性）
        const retPattern = 'return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};';
        if (c.indexOf(retPattern) >= 0) {
          c = c.replace(retPattern, `try{globalThis.__retHit=true;globalThis.__retData={hrType:typeof _$hr,hrLen:(_$hr&&_$hr.length)?_$hr.length:null,hrHead:(_$hr&&_$hr.slice)?Array.from(_$hr.slice(0,30)):null,hrTail:(_$hr&&_$hr.slice)?Array.from(_$hr.slice(-10)):null,phKeys:(_$pH&&_$pH._$ky)?Object.keys(_$pH._$ky):null,phHq:(_$pH&&_$pH._$hq&&_$pH._$hq.length)?_$pH._$hq.length:null,ouType:typeof _$ou,jdType:typeof _$oF};}catch(e){globalThis.__retErr=String(e)}return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};`);
          console.log('[RET] return 插桩 OK');
        } else { console.log('[RET] ✗ return 模式未找到'); }
        fs.writeFileSync('/tmp/nx_dynCode_ret_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[RET] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
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
  for (const k of ['__retHit', '__retData', '__retErr']) {
    try {
      const v = w[k];
      if (typeof v === 'string') console.log('[RET] ' + k + ':', v.substring(0, 2000));
      else console.log('[RET] ' + k + ':', JSON.stringify(v).substring(0, 2000));
    } catch (e) { console.log('[RET] ' + k + ' err:', e.message); }
  }
  console.log('[RET] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[RET] FATAL:', e && e.message); process.exit(1); });
