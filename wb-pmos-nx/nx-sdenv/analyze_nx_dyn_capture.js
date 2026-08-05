// dynCode 截获 v2：sandbox_keygen 已验证 Proxy eval 可截获 dynCode（Node vm 沙箱）。
// sdenv 是 jsdom，需 Proxy eval + toString 伪装 + 多入口（execScript/document.write/createElement）。
// 目标：拿到 dynCode 文本 → 插桩 _$pg → 反编译 basearr 构造函数。
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[DYN] pid=%d start', process.pid);
  let dynCode = null;
  let via = null;
  const bigWrites = [];
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      const isDyn = (s) => typeof s === 'string' && s.length > 50000 && s.indexOf('function') >= 0;
      // 1. Proxy eval（伪装 toString 为 native）
      try {
        const ne = w.eval;
        if (typeof ne === 'function') {
          const proxy = new Proxy(ne, {
            apply(target, thisArg, args) {
              try { const c = args[0]; if (isDyn(c) && !dynCode) { dynCode = c; via = 'Proxy eval'; console.log('[DYN] ★ eval 截获 len=' + c.length); } } catch (e) { }
              return Reflect.apply(target, thisArg, args);
            },
          });
          proxy.toString = () => 'function eval() { [native code] }';
          w.eval = proxy;
        }
      } catch (e) { console.log('[DYN] eval proxy 失败:', e.message); }
      // 2. execScript
      try {
        if (typeof w.execScript === 'function') {
          const oes = w.execScript.bind(w);
          w.execScript = function (c) { try { if (isDyn(c) && !dynCode) { dynCode = c; via = 'execScript'; console.log('[DYN] ★ execScript 截获 len=' + c.length); } } catch (e) { } return oes(c); };
        }
      } catch (e) { }
      // 3. document.write（大字符串）
      try {
        const owrite = w.document.write && w.document.write.bind(w.document);
        if (owrite) {
          w.document.write = function (s) {
            try { if (typeof s === 'string' && s.length > 1000) bigWrites.push({ len: s.length, head: s.slice(0, 60) }); } catch (e) { }
            return owrite(s);
          };
        }
      } catch (e) { }
      // 4. createElement('script') 的 textContent/appendChild
      try {
        const oce = w.document.createElement.bind(w.document);
        w.document.createElement = function (tag) {
          const el = oce(tag);
          if (String(tag).toLowerCase() === 'script') {
            try {
              const od = Object.getOwnPropertyDescriptor(w.HTMLScriptElement && w.HTMLScriptElement.prototype || el, 'text');
            } catch (e) { }
            const oSet = el.__lookupSetter__('text') || el.__lookupSetter__('textContent');
            try {
              Object.defineProperty(el, 'text', {
                set(v) { try { if (isDyn(v)) { dynCode = dynCode || v; via = 'script.text'; console.log('[DYN] ★ script.text 截获 len=' + v.length); } } catch (e) { } if (oSet) oSet.call(this, v); else el._t = v; },
                get() { return el._t || ''; },
                configurable: true,
              });
            } catch (e) { }
          }
          return el;
        };
      } catch (e) { }
    },
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
  console.log('[DYN] dynCode via=' + via + ' len=' + (dynCode ? dynCode.length : 0));
  console.log('[DYN] bigWrites:', bigWrites.length, bigWrites.slice(0, 3).map(b => b.len + ':' + b.head.slice(0, 30)).join(' | '));
  if (dynCode) fs.writeFileSync('/tmp/nx_dynCode_captured.js', dynCode);
  else console.log('[DYN] ✗ dynCode 未截获（需进一步定位执行路径）');
  fs.writeFileSync('/tmp/nx_dyn_capture.json', JSON.stringify({ via, dynLen: dynCode ? dynCode.length : 0, bigWrites }, null, 1));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[DYN] FATAL:', e && e.message); process.exit(1); });
