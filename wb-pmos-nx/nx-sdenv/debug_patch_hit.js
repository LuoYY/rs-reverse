// 调试：确认插桩模式在截获的 dynCode 中是否命中
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[DBG] start');
  const origRun = vm.runInContext;
  let hits = 0;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0) {
        hits++;
        console.log('[DBG] 截获 dynCode len=' + code.length + ' hit#' + hits);
        // 检查模式
        const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
        console.log('[DBG] _$dJ 模式命中:', code.indexOf(dJPattern) >= 0);
        console.log('[DBG] _$eQ 模式命中:', code.indexOf('function _$eQ(_$aq){this._$ky={}') >= 0);
        // 结尾
        const tail = code.slice(-120);
        console.log('[DBG] 结尾:', JSON.stringify(tail));
        // 是否含 _\$dJ 附近
        const i = code.indexOf('function _$dJ');
        console.log('[DBG] _$dJ @', i, ':', i >= 0 ? code.substring(i, i + 90) : 'N/A');
        // 插桩测试
        let c2 = code;
        const before = c2.length;
        c2 = c2.replace(dJPattern, 'function _$dJ(){try{globalThis.__PATCH_HIT=1;}catch(e){}_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}');
        console.log('[DBG] 替换后长度变化:', before, '->', c2.length, '替换生效:', before !== c2.length);
        fs.writeFileSync('/tmp/nx_dynCode_patched2.js', c2);
        console.log('[DBG] 已保存插桩版');
      }
    } catch (e) { console.log('[DBG] hook 异常:', e.message); }
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
  try { console.log('[DBG] __PATCH_HIT:', w.__PATCH_HIT); } catch (e) { console.log('[DBG] __PATCH_HIT err', e.message); }
  try { console.log('[DBG] dynDone:', w.__dynDone); } catch (e) {}
  console.log('[DBG] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[DBG] FATAL:', e && e.message); process.exit(1); });
