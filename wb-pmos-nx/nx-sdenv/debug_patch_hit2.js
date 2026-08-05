// 调试2：验证插桩代码是否被执行 + dump _$k6 动态代码
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[DBG2] start');
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0) {
        console.log('[DBG2] 截获 dynCode len=' + code.length);
        // 1. 尾部标记（IIFE 结束后执行，验证 code 是否真被执行）
        code = code.replace(/\}\)\(_ts\.scj,_ts\.aebi\);\s*$/, ';globalThis.__TAIL_HIT=1;}($_ts.scj,$_ts.aebi);');
        // 2. _$dJ 插桩
        const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
        if (code.indexOf(dJPattern) >= 0) {
          code = code.replace(dJPattern, `function _$dJ(){try{globalThis.__DJ_HIT=(globalThis.__DJ_HIT||0)+1;}catch(e){globalThis.__DJ_ERR=String(e);}}`);
          console.log('[DBG2] _$dJ 插桩 OK');
        }
        // 3. _$k6 拼接点插桩（dump 动态代码）
        const k6Mark = '_$k6=_$mD[5][_$oU[17]](';
        if (code.indexOf(k6Mark) >= 0) {
          // 在赋值后插入 dump
          code = code.replace(k6Mark, 'globalThis.__K6_SAVE=_$k6;' + k6Mark);
          console.log('[DBG2] _$k6 插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_patched3.js', code);
        console.log('[DBG2] 已保存 patched3');
      }
    } catch (e) { console.log('[DBG2] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
  });
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  const w = dom.window;
  for (const k of ['__TAIL_HIT', '__DJ_HIT', '__DJ_ERR', '__K6_SAVE']) {
    try {
      const v = w[k];
      if (typeof v === 'string') console.log('[DBG2] ' + k + ':', v.substring(0, 200));
      else console.log('[DBG2] ' + k + ':', v);
    } catch (e) { console.log('[DBG2] ' + k + ' err:', e.message); }
  }
  console.log('[DBG2] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[DBG2] FATAL:', e && e.message); process.exit(1); });
