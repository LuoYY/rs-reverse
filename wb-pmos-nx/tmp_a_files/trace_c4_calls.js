// 追踪所有 _$c4 递归调用（含参数）：还原 base 生成完整执行树
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
  console.log('[CC] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[CC] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 包装 _$c4：记录每次调用（op + args）
        const fnIdx = c.indexOf('function _$c4(');
        let depth = 0, end = -1;
        for (let i = fnIdx; i < c.length; i++) {
          if (c[i] === '{') depth++;
          else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end > 0) {
          // 在 _$c4 函数体开头注入记录（用 window 而非 globalThis）
          const bodyStart = c.indexOf('{', fnIdx) + 1;
          const inject = `try{window.__calls=window.__calls||[];var __a=Array.from(arguments);window.__calls.push(__a.map(function(x){return Array.isArray(x)?("arr:"+x.length):(typeof x==="object"&&x!==null?"obj":String(x).slice(0,20))}).join("|"));if(window.__calls.length>8000)window.__calls.splice(0,4000);}catch(__e){window.__ccE=String(__e);}`;
          c = c.slice(0, bodyStart) + inject + c.slice(bodyStart);
          console.log('[CC] _$c4 体内注入 OK');
        }
        fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_cc_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[CC] hook err:', e.message); }
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
  const n = ev('typeof __calls!=="undefined"?__calls.length:0');
  console.log('[CC] _$c4 调用数:', n);
  console.log('[CC] err:', ev('typeof __ccE!=="undefined"?__ccE:null'));
  const head = ev('typeof __calls!=="undefined"?JSON.stringify(__calls.slice(0,40)):null');
  console.log('[CC] head:', head);
  const tail = ev('typeof __calls!=="undefined"?JSON.stringify(__calls.slice(-60)):null');
  console.log('[CC] tail:', tail);
  const full = ev('typeof __calls!=="undefined"?JSON.stringify(__calls):null');
  if (full) fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_c4_calls.json', full);
  console.log('[CC] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[CC] FATAL:', e && e.message); process.exit(1); });
