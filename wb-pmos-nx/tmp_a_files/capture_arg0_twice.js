// 一次运行同时捕获：arg0[143]明文（op=1842的固定明文）+ ktFinal + 时间戳
// 输出 nx_arg0_run_<tag>.json，跑两次对比 base 确定性
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const TAG = process.env.NX_TAG || 'A';

(async () => {
  console.log('[A0] run=' + TAG + ' pid=' + process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        let c = code;
        // op=1842 捕获 arg0 明文 + arg1 密钥
        const fnIdx = c.indexOf('function _$c4(');
        const bodyStart = c.indexOf('{', fnIdx) + 1;
        const inject = `try{if(arguments[0]===1842){var __a=Array.from(arguments);if(window.__a0===undefined){window.__a0=Array.isArray(__a[1])?Array.from(__a[1]):null;window.__a1=Array.isArray(__a[2])?Array.from(__a[2]):null;}}window.__sq=(window.__sq||0)+1;}catch(__e){window.__aE=String(__e);}`;
        c = c.slice(0, bodyStart) + inject + c.slice(bodyStart);
        // _$g1 记录 ktFinal
        const g1Target = 'function _$g1(){_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
        if (c.indexOf(g1Target) >= 0) {
          const inj2 = 'function _$g1(){try{window.__ktF=Array.isArray(_$kt)?Array.from(_$kt):null;}catch(__e){}_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
          c = c.split(g1Target).join(inj2);
        }
        // 捕获 _$ez（keys 拼接，含时间戳）
        const retTarget = 'return _$hF.apply(this,_$eS);';
        if (c.indexOf(retTarget) >= 0) {
          const inj3 = `try{if(window.__ezD===undefined){window.__ezD=Array.isArray(_$ez)?Array.from(_$ez):(typeof _$ez==="string"?Array.from(_$ez).map(function(x){return x.charCodeAt(0);}):null);}}catch(__e){window.__ezE=String(__e);}` + retTarget;
          c = c.split(retTarget).join(inj3);
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_a0_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[A0] hook err:', e.message); }
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
  const out = {
    run: TAG,
    arg0: ev('typeof __a0!=="undefined"?JSON.stringify(__a0):null'),
    arg1: ev('typeof __a1!=="undefined"?JSON.stringify(__a1):null'),
    ktFinal: ev('typeof __ktF!=="undefined"?JSON.stringify(__ktF):null'),
    ez: ev('typeof __ezD!=="undefined"?JSON.stringify(__ezD):null'),
    err: ev('typeof __aE!=="undefined"?__aE:null'),
    Pval: (dom.cookieJar.getCookieStringSync(B + '/').match(/P=([^;]*)/) || [])[1] || null,
  };
  for (const k of ['arg0', 'arg1', 'ktFinal', 'ez']) {
    if (out[k] === 'ERR:' || out[k] === null) console.log('[A0] ' + k + ' 捕获失败:', String(out[k]).slice(0, 60));
    else { out[k] = JSON.parse(out[k]); console.log('[A0] ' + k + ' len=' + out[k].length); }
  }
  fs.writeFileSync(path.join(__dirname, 'nx_arg0_run' + TAG + '.json'), JSON.stringify(out));
  console.log('[A0] saved nx_arg0_run' + TAG + '.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[A0] FATAL:', e && e.stack); process.exit(1); });
