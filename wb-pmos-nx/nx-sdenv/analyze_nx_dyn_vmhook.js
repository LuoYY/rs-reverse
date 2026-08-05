// dynCode 截获 v3：hook Node 全局 vm.runInContext（sdenv-jsdom script 执行核心）。
// 任何 >50KB 的代码都截获 → 拿到 dynCode 完整文本 → 后续插桩 _$pg。
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[VH] pid=%d start', process.pid);
  // hook vm.runInContext
  const origRun = vm.runInContext;
  const bigCodes = [];
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 50000) {
        bigCodes.push({ len: code.length, head: code.slice(0, 80) });
        fs.writeFileSync('/tmp/nx_dynCode_captured_' + bigCodes.length + '.js', code);
        console.log('[VH] ★ vm.runInContext 截获 dynCode len=' + code.length);
      } else if (typeof code === 'string' && code.length > 5000) {
        bigCodes.push({ len: code.length, head: code.slice(0, 50) });
      }
    } catch (e) { }
    return origRun(code, ctx, opts);
  };
  // hook vm.runInThisContext / script.runInContext
  try {
    const Script = vm.Script;
    const oRun = Script.prototype.runInContext;
    Script.prototype.runInContext = function (ctx, opts) {
      try {
        const src = this._src || '';
        if (src.length > 50000) { bigCodes.push({ len: src.length, via: 'Script.runInContext' }); console.log('[VH] Script.runInContext len=' + src.length); }
      } catch (e) { }
      return oRun.call(this, ctx, opts);
    };
  } catch (e) { }

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
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  console.log('[VH] 截获大代码数:', bigCodes.length);
  bigCodes.forEach((b, i) => console.log('[VH]   #' + i + ' len=' + b.len + ' via=' + (b.via || 'vm.runInContext') + ' head=' + (b.head || '').replace(/\n/g, ' ').slice(0, 60)));
  fs.writeFileSync('/tmp/nx_dyn_vmhook.json', JSON.stringify(bigCodes, null, 1));
  console.log('[VH] saved /tmp/nx_dyn_vmhook.json done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[VH] FATAL:', e && e.message); process.exit(1); });
