// 包装 _$c4：记录每次调用的返回值，找返回 59 头数组/含 base 的调用
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_c4_retvals.json');

(async () => {
  console.log('[RV] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[RV] ★ 截获 dynCode len=' + code.length);
        let c = code;
        const fnIdx = c.indexOf('function _$c4(');
        let depth = 0, end = -1;
        for (let i = fnIdx; i < c.length; i++) {
          if (c[i] === '{') depth++;
          else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end > 0) {
          const origFn = c.slice(fnIdx, end + 1);
          // 记录调用次数 + 返回数组（含长度/头/尾）
          const wrapper = `globalThis.__rvLog=[];var __rvOrig=${origFn};function _$c4(){var __r=__rvOrig.apply(this,arguments);try{if(__r&&__r.length&&__r.length>=130&&__r.length<=250&&Array.isArray(__r)){globalThis.__rvLog.push({op:arguments[0],len:__r.length,head:Array.from(__r.slice(0,8))});if(globalThis.__rvLog.length>200)globalThis.__rvLog.splice(0,100);}}catch(__e){globalThis.__rvE=String(__e);}return __r;}`;
          c = c.slice(0, fnIdx) + wrapper + c.slice(end + 1);
          console.log('[RV] _$c4 包装 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_rv_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[RV] hook err:', e.message); }
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
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[RV] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[RV] err:', ev('typeof __rvE!=="undefined"?__rvE:null'));
  const n = ev('typeof __rvLog!=="undefined"?__rvLog.length:0');
  console.log('[RV] 返回大数组的调用数:', n);
  const head = ev('typeof __rvLog!=="undefined"?JSON.stringify(__rvLog.slice(0,10)):null');
  console.log('[RV] head:', head);
  const tail = ev('typeof __rvLog!=="undefined"?JSON.stringify(__rvLog.slice(-15)):null');
  console.log('[RV] tail:', tail);
  const full = ev('typeof __rvLog!=="undefined"?JSON.stringify(__rvLog):null');
  if (full) fs.writeFileSync(OUT, full);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[RV] FATAL:', e && e.message); process.exit(1); });
