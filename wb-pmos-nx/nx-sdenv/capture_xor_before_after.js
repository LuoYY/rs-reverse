// 捕获 XOR 循环前后 _$ez 状态：确认 XOR 是加密还是解密
// 插桩 op611 前后（在主循环 opcode 取值点，记录 op=611 前后 ez 值）
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[XBA] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[XBA] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 插桩 op611 执行：XOR 循环体前后 ez 值
        // 在 op611 分支（else 内 for 循环）前后插桩
        const xorBody = 'for(_$$A=0;_$$A<_$k0[50];_$$A++ ,_$kB++ ){_$ez[_$kB]^=_$pL[_$$A];}';
        if (c.indexOf(xorBody) >= 0) {
          const inject = 'try{globalThis.__xba=globalThis.__xba||[];if(globalThis.__xba.length<4){globalThis.__xba.push(JSON.stringify({ev:"before",kB:_$kB,ez:Array.from(_$ez).slice(0,12)}));}}catch(e){}' + xorBody + 'try{globalThis.__xba.push(JSON.stringify({ev:"after",kB:_$kB,ez:Array.from(_$ez).slice(0,12)}));}catch(e){}';
          c = c.replace(xorBody, inject);
          console.log('[XBA] op611 XOR 插桩 OK');
        } else { console.log('[XBA] ✗ xorBody 未找到'); }
        fs.writeFileSync('/tmp/nx_dynCode_xba_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[XBA] hook err:', e.message); }
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
  const log = evalV('typeof __xba!=="undefined"?JSON.stringify(__xba):null');
  console.log('[XBA] __xba:', log);
  console.log('[XBA] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[XBA] FATAL:', e && e.message); process.exit(1); });
