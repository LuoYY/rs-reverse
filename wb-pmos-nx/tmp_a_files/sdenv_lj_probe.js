// 用 sdenv 完整环境执行外层 VM，观察 while(3) 中 _$lj 的真实值（对比 buildEnv）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const vm = require('vm');
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const LOCAL_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

(async () => {
  const origRun = vm.runInContext;
  let dynCode = null;
  vm.runInContext = function (code, ctx, opts) {
    if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !dynCode) {
      dynCode = code;
      let c = code;
      const pat = '_$jc===302){_$oL+=-9;}';
      if (c.indexOf(pat) >= 0) {
        c = c.split(pat).join('_$jc===302){window.__lj302=window.__lj302||[];window.__lj302.push(_$lj);if(window.__lj302.length>200)window.__lj302.shift();_$oL+=-9;}');
        console.log('[SJ] op302 插桩 OK');
      }
      const pat2 = '_$jc===204){_$a2=window;}';
      if (c.indexOf(pat2) >= 0) {
        c = c.split(pat2).join('_$jc===204){window.__a2ok=(window.__a2ok||0)+1;_$a2=window;}');
        console.log('[SJ] op204 插桩 OK');
      }
      code = c;
      fs.writeFileSync(path.join(__dirname, 'nx_dynCode_lj_patched.js'), code);
    }
    return origRun(code, ctx, opts);
  };

  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      try {
        const c = dom.cookieJar.getCookieStringSync(B + '/');
        const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
        if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); return; }
        lastLen = pLen;
        if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
      } catch (e) {}
    }, 300);
  });
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[SJ] dynCode:', dynCode ? '捕获 ' + dynCode.length : '未捕获');
  console.log('[SJ] lj302:', ev('typeof __lj302!=="undefined"?JSON.stringify(__lj302):null'));
  console.log('[SJ] a2ok:', ev('typeof __a2ok!=="undefined"?__a2ok:null'));
  const P = (dom.cookieJar.getCookieStringSync(B + '/').match(/P=([^;]*)/) || [])[1];
  console.log('[SJ] P len:', P ? P.length : 0);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[SJ] FATAL:', e.message); process.exit(1); });
