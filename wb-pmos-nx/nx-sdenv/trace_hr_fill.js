// 插桩追踪 _\$hr 数组填充：在主循环中检测 _\$hr 变为 59 头数组的时刻
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[HF] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[HF] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 _$c4 中 _\$hr 的所有赋值点插桩（检测 basearr 头）
        // 用主循环 opcode 取值点插桩，检测执行后 _\$hr 状态
        const target = '_$pW=_$bk[_$g6++];if(_$pW<1732)';
        if (c.indexOf(target) >= 0) {
          const inject = `_$pW=_$bk[_$g6++];try{if(_$hr&&_$hr.length>100&&(_$hr[0]===59||_$hr[0]===179)){globalThis.__hrFill=globalThis.__hrFill||[];if(globalThis.__hrFill.length<3){globalThis.__hrFill.push({pc:_$g6-1,op:_$pW,head:Array.from(_$hr).slice(0,25)});}}}catch(e){globalThis.__hfErr=String(e)}if(_$pW<1732)`;
          c = c.replace(target, inject);
          console.log('[HF] 主循环插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_hf_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[HF] hook err:', e.message); }
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
  const evalV = (expr) => { try { return w.eval(expr); } catch (e) { return 'ERR:' + e.message; } };
  const log = evalV('typeof __hrFill!=="undefined"?JSON.stringify(__hrFill):null');
  console.log('[HF] __hrFill:', log);
  console.log('[HF] __hfErr:', evalV('typeof __hfErr!=="undefined"?__hfErr:null'));
  console.log('[HF] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[HF] FATAL:', e && e.message); process.exit(1); });
