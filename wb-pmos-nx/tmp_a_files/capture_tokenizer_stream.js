// 捕获真实 tokenizer token 流：patch _$h7 函数（包装其返回的 pC，记录每次调用 token）
// 用 trace_1464_values.js 同款拦截（LOCAL_PROXY 8080）
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
        console.log('[TS] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 包装 _$h7 工厂：在其 return 处记录（_$h7 返回 pC 函数，包装 pC 记录 token）
        // _$h7 函数体：...return _$pC;function _$kx(){...}...  → 在 return _$pC; 处注入包装
        const retPat = 'return _$pC;function _$kx(){_$jM=0;}';
        if (c.indexOf(retPat) >= 0) {
          const inj = `var __origPC=_$pC;window.__tokStreams=window.__tokStreams||[];var __capPC=function(){var __orig=__origPC;var __wrap=function(){try{var r=__orig.apply(this,arguments);window.__tokStreams[window.__tokStreams.length-1].push({t:r._$b4,v:typeof r._$g$==="string"?r._$g$:(r._$g$&&r._$g$.length!==undefined?"L"+r._$g$.length:String(r._$g$))});return r;}catch(e){window.__tokStreams[window.__tokStreams.length-1].push({ERR:String(e&&e.message||e)});throw e;}};return __wrap;};window.__h7Count=(window.__h7Count||0)+1;window.__tokStreams.push([]);return __capPC();function _$kx(){_$jM=0;}`;
          c = c.split(retPat).join(inj);
          console.log('[TS] _$h7 包装 OK');
        } else {
          console.log('[TS] ✗ return _$pC 模式未找到');
          // 备用：找 'return _$pC'
          const rp = c.indexOf('return _$pC;');
          console.log('[TS] return _$pC @' + rp + ':', rp >= 0 ? c.slice(rp, rp + 80) : '');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_ts_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[TS] hook err:', e.message); }
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
  const n = ev('typeof __h7Count!=="undefined"?__h7Count:0');
  console.log('[TS] _$h7 调用数:', n);
  const lens = ev('typeof __tokStreams!=="undefined"?JSON.stringify(__tokStreams.map(x=>x.length)):null');
  console.log('[TS] 各流长度:', lens);
  const full = ev('typeof __tokStreams!=="undefined"?JSON.stringify(__tokStreams):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_token_streams.json'), full);
  console.log('[TS] saved nx_token_streams.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[TS] FATAL:', e && e.stack); process.exit(1); });
