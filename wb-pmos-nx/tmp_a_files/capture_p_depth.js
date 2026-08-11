// 捕获真实 _$iE 中 _$p_ 的递归深度（验证离线解析是否正确）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[PD] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 _$iE 闭包内的 _$p_ 加深度计数（用闭包外 console？不行）
        // 直接找 '_$aq._$iH=_$kP()' 前加计数（_\$p_ 是 _\$hr 内部函数）
        const pat = '_$aq={},_$aq._$iH=_$kP(),_$aq._$fL=_$kP(),_$aq._$gS=_$eg()';
        if (c.indexOf(pat) >= 0) {
          // 闭包内用 _$k6.length 判断？太复杂。直接记录 gS 位置（_\$iz 的 _\$hZ 不可达）
          // 改为：用 console.error 计数（不影响逻辑）
          const inj = `try{globalThis.__pd=(globalThis.__pd||0)+1;}catch(e){};` + pat;
          c = c.split(pat).join(inj);
          console.log('[PD] _$p_ 计数 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_pd_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[PD] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
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
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[PD] _$p_ 调用计数:', ev('typeof __pd!=="undefined"?__pd:null'));
  const P = (dom.cookieJar.getCookieStringSync(B + '/').match(/P=([^;]*)/) || [])[1];
  console.log('[PD] P len:', P ? P.length : 0);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[PD] FATAL:', e && e.stack); process.exit(1); });
