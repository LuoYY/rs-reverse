// 插桩 op=1842 调用：捕获完整数组参数 + _$kt 变化
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
  console.log('[1842] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[1842] ★ 截获 dynCode len=' + code.length);
        let c = code;
        const fnIdx = c.indexOf('function _$c4(');
        let depth = 0, end = -1;
        for (let i = fnIdx; i < c.length; i++) {
          if (c[i] === '{') depth++;
          else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end > 0) {
          const bodyStart = c.indexOf('{', fnIdx) + 1;
          const inject = `try{window.__sq=(window.__sq||0)+1;if(arguments[0]===1842){window.__a1842=window.__a1842||[];var __a=Array.from(arguments);window.__a1842.push({seq:window.__sq,args:__a.slice(1).map(function(x){if(Array.isArray(x))return{x:Array.from(x)};return String(x).slice(0,20);}),kt:Array.isArray(_$kt)?Array.from(_$kt.slice(0,230)):null});}}catch(__e){window.__a18E=String(__e);}`;
          c = c.slice(0, bodyStart) + inject + c.slice(bodyStart);
          console.log('[1842] op=1842 捕获注入 OK');
        }
        // _$g1 记录 kt
        const g1Target = 'function _$g1(){_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
        if (c.indexOf(g1Target) >= 0) {
          const inject = 'function _$g1(){try{window.__ktF=Array.isArray(_$kt)?Array.from(_$kt):null;}catch(__e){}_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
          c = c.split(g1Target).join(inject);
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_1842_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[1842] hook err:', e.message); }
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
  console.log('[1842] a1842 数:', ev('typeof __a1842!=="undefined"?__a1842.length:0'), 'err:', ev('typeof __a18E!=="undefined"?__a18E:null'));
  const full = ev('typeof __a1842!=="undefined"?JSON.stringify(__a1842):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_1842_calls.json'), full);
  const kt = ev('typeof __ktF!=="undefined"?JSON.stringify(__ktF):null');
  if (kt) fs.writeFileSync(path.join(__dirname, 'nx_ktF_1842.json'), kt);
  console.log('[1842] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[1842] FATAL:', e && e.stack); process.exit(1); });
