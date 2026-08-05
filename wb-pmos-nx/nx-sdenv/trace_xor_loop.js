// 插桩追踪 XOR 核心循环：捕获 op611 执行时的 _$ez/_$pL/_$kB/_$iH 状态
// 目标：确认 ez 是什么（basearr? numarrEncrypt?），pL 是否 keys2
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[XOR] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[XOR] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // op611 = XOR 循环（for(A=0;A<k0[50];A++,kB++){ez[kB]^=pL[A]}）
        // 在 op611 分支体前插桩记录状态
        const xorTarget = 'else{for(_$$A=0;_$$A<_$k0[50];_$$A++ ,_$kB++ ){_$ez[_$kB]^=_$pL[_$$A];}}';
        if (c.indexOf(xorTarget) >= 0) {
          const inject = `try{globalThis.__xorCalls=(globalThis.__xorCalls||0)+1;if(globalThis.__xorCalls<=8){globalThis.__xorLog=globalThis.__xorLog||[];globalThis.__xorLog.push(JSON.stringify({kB:_$kB,iH:_$iH,ezType:typeof _$ez,ezLen:(_$ez&&_$ez.length)?_$ez.length:null,ezHead:(_$ez&&_$ez.slice)?Array.from(_$ez.slice(0,12)):null,ezTail:(_$ez&&_$ez.slice)?Array.from(_$ez.slice(-8)):null,pLType:typeof _$pL,pLLen:(_$pL&&_$pL.length)?_$pL.length:null,pLHead:(_$pL&&_$pL.slice)?Array.from(_$pL.slice(0,16)):null}));}}catch(e){globalThis.__xorErr=String(e)}` + xorTarget;
          c = c.replace(xorTarget, inject);
          console.log('[XOR] op611 插桩 OK');
        } else { console.log('[XOR] ✗ op611 模式未找到'); }
        fs.writeFileSync('/tmp/nx_dynCode_xor_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[XOR] hook err:', e.message); }
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
  console.log('[XOR] __xorCalls:', evalV('typeof __xorCalls!=="undefined"?__xorCalls:null'));
  const log = evalV('typeof __xorLog!=="undefined"?JSON.stringify(__xorLog):null');
  console.log('[XOR] __xorLog:', log);
  console.log('[XOR] __xorErr:', evalV('typeof __xorErr!=="undefined"?__xorErr:null'));
  console.log('[XOR] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[XOR] FATAL:', e && e.message); process.exit(1); });
