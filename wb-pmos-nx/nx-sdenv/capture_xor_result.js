// 捕获 XOR 循环后的 _$ez 内容（= base 数据） + _\$e4 处理
// 插桩点：pc=1603 op644（_$kB=_$ez[length]）之前，即 XOR 循环完成后
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[XR] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[XR] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 op644 (_$kB=_$ez[_$oU[6]]) 前插桩：XOR 循环后 ez 状态
        // 但这是函数池代码，多次调用。更精确：在 XOR 循环 (op611 else) 后
        // 用 opcode 流检测：捕获 op737 前的 ez（XOR 循环入口）
        const target = '_$pW=_$bk[_$g6++];if(_$pW<1732)';
        if (c.indexOf(target) >= 0) {
          const inject = `_$pW=_$bk[_$g6++];try{if(_$pW===737){globalThis.__xorDone=globalThis.__xorDone||[];if(globalThis.__xorDone.length<3){globalThis.__xorDone.push({ezType:typeof _$ez,ezStr:typeof _$ez==="string"?_$ez.slice(0,200):null,ezArr:(_$ez&&_$ez.length)?Array.from(_$ez.slice(0,30)):null,pL:Array.from(_$pL||[])});}}}catch(e){globalThis.__xdErr=String(e)}if(_$pW<1732)`;
          c = c.replace(target, inject);
          console.log('[XR] op737 插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_xr_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[XR] hook err:', e.message); }
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
  const log = evalV('typeof __xorDone!=="undefined"?JSON.stringify(__xorDone):null');
  console.log('[XR] __xorDone:', log);
  console.log('[XR] __xdErr:', evalV('typeof __xdErr!=="undefined"?__xdErr:null'));
  console.log('[XR] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[XR] FATAL:', e && e.message); process.exit(1); });
