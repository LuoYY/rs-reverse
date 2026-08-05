// 追踪 sdenv 里瑞数执行 dynCode 的真实路径：
// 记录 eval 所有调用（长度分布）+ Function 构造 + script 注入，确认 dynCode 走哪。
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[TR] pid=%d start', process.pid);
  const evals = [], funcs = [], scripts = [], docs = [];
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      const mark = (arr, s, via) => { try { arr.push({ len: typeof s === 'string' ? s.length : -1, via, head: typeof s === 'string' ? s.slice(0, 40).replace(/\n/g, ' ') : String(typeof s) }); } catch (e) { } };
      // eval：Proxy 包原生，记录所有调用
      try {
        const ne = w.eval;
        const proxy = new Proxy(ne, {
          apply(t, th, args) {
            mark(evals, args[0], 'eval');
            return Reflect.apply(t, th, args);
          },
        });
        proxy.toString = () => 'function eval() { [native code] }';
        w.eval = proxy;
      } catch (e) { console.log('[TR] eval proxy err', e.message); }
      // Function 构造
      try {
        const OF = w.Function;
        w.Function = function () {
          const args = Array.from(arguments);
          const body = args.length ? args[args.length - 1] : '';
          mark(funcs, body, 'Function');
          return OF.apply(this, arguments);
        };
        w.Function.prototype = OF.prototype;
        // 注意：瑞数可能用缓存引用，再补一个函数属性
      } catch (e) { }
      // document.write
      try {
        const ow = w.document.write.bind(w.document);
        w.document.write = function (s) { mark(docs, s, 'docWrite'); return ow(s); };
      } catch (e) { }
      // 观察 script 注入
      try {
        const oCE = w.document.createElement.bind(w.document);
        w.document.createElement = function (tag) {
          const el = oCE(tag);
          if (String(tag).toLowerCase() === 'script') {
            const setT = el.__lookupSetter__('text') || el.__lookupSetter__('textContent');
            try {
              Object.defineProperty(el, 'text', {
                set(v) { mark(scripts, v, 'scriptText'); if (setT) setT.call(el, v); },
                get() { return el._t; }, configurable: true,
              });
            } catch (e) { }
          }
          return el;
        };
      } catch (e) { }
      // appendChild 拦截（script 注入检测）
      try {
        const oAC = w.Element.prototype.appendChild;
        w.Element.prototype.appendChild = function (child) {
          try { if (child && child.tagName === 'SCRIPT') { const t = child.textContent || ''; mark(scripts, t, 'appendChild'); } } catch (e) { }
          return oAC.call(this, child);
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
  const summarize = (arr, name) => {
    console.log('[TR] ' + name + ' 调用 ' + arr.length + ' 次');
    const big = arr.filter(x => x.len > 1000);
    console.log('[TR]   >1KB: ' + big.length + ' 个, 长度: ' + big.map(b => b.len).join(','));
    const lens = arr.filter(x => x.len >= 0).map(x => x.len).sort((a, b) => b - a).slice(0, 5);
    console.log('[TR]   最大: ' + lens.join(','));
  };
  summarize(evals, 'eval');
  summarize(funcs, 'Function');
  summarize(scripts, 'script注入');
  summarize(docs, 'document.write');
  console.log('[TR] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  fs.writeFileSync('/tmp/nx_dyn_trace.json', JSON.stringify({ evals, funcs, scripts, docs }, null, 1));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[TR] FATAL:', e && e.message); process.exit(1); });
