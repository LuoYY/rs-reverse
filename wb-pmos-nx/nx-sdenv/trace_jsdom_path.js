// 综合诊断：确定 jsdom 执行 dynCode 的真实路径，并插桩成功
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[PTH] start');
  const origRun = vm.runInContext;
  const origScriptRun = vm.Script.prototype.runInContext;
  let patchedOnce = false;

  // hook Script.prototype.runInContext（jsdom 内部常用 new vm.Script().runInContext(ctx)）
  vm.Script.prototype.runInContext = function (ctx, opts) {
    let src = null;
    try { src = this.toString(); } catch (e) {}
    try {
      // Script.toString() 返回源码
      if (typeof src === 'string' && src.length > 400000 && src.indexOf('function _$c4') >= 0 && !patchedOnce) {
        patchedOnce = true;
        console.log('[PTH] ★ Script.runInContext 截获 dynCode len=' + src.length);
        let code = src;
        // 插桩尾部
        const tailRe = /\}\)\(_\$ts\.scj,_\$ts\.aebi\);\s*$/;
        console.log('[PTH] 尾部模式命中:', tailRe.test(code));
        code = code.replace(tailRe, ';globalThis.__TAIL_HIT=1;}($_ts.scj,$_ts.aebi);');
        // 插桩 _$dJ
        const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
        if (code.indexOf(dJPattern) >= 0) {
          code = code.replace(dJPattern, 'function _$dJ(){try{globalThis.__DJ_HIT=(globalThis.__DJ_HIT||0)+1;}catch(e){globalThis.__DJ_ERR=String(e);}}');
          console.log('[PTH] _$dJ 插桩 OK');
        } else { console.log('[PTH] ✗ _$dJ 未找到'); }
        fs.writeFileSync('/tmp/nx_dynCode_script_patched.js', code);
        console.log('[PTH] 已保存 patched len=' + code.length);
        // 用 new Script 替换执行
        try {
          const newScr = new vm.Script(code, { filename: 'dyn_patched.js' });
          console.log('[PTH] 新 Script 编译成功');
          return newScr.runInContext(ctx, opts);
        } catch (e) {
          console.log('[PTH] 新 Script 编译失败:', e.message.substring(0, 200));
        }
      }
    } catch (e) { console.log('[PTH] hook err:', e.message); }
    return origScriptRun.call(this, ctx, opts);
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
  for (const k of ['__TAIL_HIT', '__DJ_HIT', '__DJ_ERR']) {
    try { console.log('[PTH] ' + k + ':', w[k]); } catch (e) { console.log('[PTH] ' + k + ' err:', e.message); }
  }
  console.log('[PTH] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[PTH] FATAL:', e && e.message); process.exit(1); });
