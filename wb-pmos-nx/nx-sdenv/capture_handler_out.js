// 捕获 handler 处理后的 basearr 数组（_$_i 修改后）
// 关键：pc38 数组 [0,1,2,3,4,5,6,7] → b2/dX/fp/_y/ey 处理后 = basearr 头部
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[HO] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[HO] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // hook 5 个 handler：记录输出（_$_i 修改后）
        for (const fn of ['_$b2', '_$dX', '_$fp', '_$_y', '_$ey', '_$$z']) {
          const defIdx = c.indexOf('function ' + fn + '(');
          if (defIdx >= 0) {
            let depth = 0, i = c.indexOf('{', defIdx), end = -1;
            for (; i < c.length; i++) {
              if (c[i] === '{') depth++;
              else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
            }
            const inject = `try{globalThis.__ho=globalThis.__ho||[];globalThis.__ho.push(JSON.stringify({fn:"${fn}",out:Array.from(_$_i).slice(0,40)}));}catch(e){}`;
            c = c.substring(0, end) + inject + c.substring(end);
            console.log('[HO] ' + fn + ' 插桩 OK');
          }
        }
        fs.writeFileSync('/tmp/nx_dynCode_ho_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[HO] hook err:', e.message); }
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
  const log = evalV('typeof __ho!=="undefined"?JSON.stringify(__ho):null');
  console.log('[HO] __ho:', log);
  console.log('[HO] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[HO] FATAL:', e && e.message); process.exit(1); });
