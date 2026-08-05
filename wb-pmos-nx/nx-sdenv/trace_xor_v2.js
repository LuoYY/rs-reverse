// 插桩 v2：主循环 opcode 取值点检测 op611（XOR 循环），记录寄存器状态
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[X2] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[X2] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在主循环 opcode 取值后插桩：_$pW=_$bk[_$g6++]; 后面
        const target = '_$pW=_$bk[_$g6++];if(_$pW<1732)';
        if (c.indexOf(target) >= 0) {
          const inject = `_$pW=_$bk[_$g6++];try{if(_$pW===611||_$pW===737||_$pW===405||_$pW===1493){globalThis.__x2=globalThis.__x2||[];if(globalThis.__x2.length<400){globalThis.__x2.push({pc:_$g6-1,op:_$pW,kB:_$kB,iH:_$iH,ez:typeof _$ez==="string"?"s"+_$ez.length:(_$ez&&_$ez.length)?Array.from(_$ez.slice(0,6)):null,pL:(_$pL&&_$pL.length)?Array.from(_$pL.slice(0,6)):null});}}}catch(e){globalThis.__x2e=String(e)}if(_$pW<1732)`;
          c = c.replace(target, inject);
          console.log('[X2] 主循环插桩 OK');
        } else { console.log('[X2] ✗ 模式未找到'); }
        fs.writeFileSync('/tmp/nx_dynCode_x2_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[X2] hook err:', e.message); }
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
  const len = evalV('typeof __x2!=="undefined"?__x2.length:null');
  console.log('[X2] __x2 len:', len);
  const log = evalV('typeof __x2!=="undefined"?JSON.stringify(__x2.slice(0,30)):null');
  console.log('[X2] head:', log);
  const tail = evalV('typeof __x2!=="undefined"?JSON.stringify(__x2.slice(-30)):null');
  console.log('[X2] tail:', tail);
  console.log('[X2] __x2e:', evalV('typeof __x2e!=="undefined"?__x2e:null'));
  console.log('[X2] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[X2] FATAL:', e && e.message); process.exit(1); });
