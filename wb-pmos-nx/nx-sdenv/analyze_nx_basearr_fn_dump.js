// 反编译 _$$p[103]：利用 sdenv VM 固定性 + 本地固定 html/js（nsd=67402 恒定）。
// hook Function.prototype.call/apply，监控返回 59 头 base 数组（140-200B）的函数，
// dump 该函数源码（Function.prototype.toString.call 绕过伪装），定位 basearr 构造逻辑。
// 目标环境 IoT（内存<64MB，不能跑 JS 模拟）→ 需纯算法，必须搞清 base 生成的确定逻辑。
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = '/tmp/nx_basearr_fn_dump.json';
const LOCAL_PROXY = 'http://127.0.0.1:8080'; // 本地固定 html/js（nsd=67402 恒定）

(async () => {
  console.log('[DUMP] pid=%d start', process.pid);
  const fnHits = []; // 返回 base 的函数源码
  const seenFns = new Set();
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      const isBase = (a) => {
        try {
          if (!Array.isArray(a) && !ArrayBuffer.isView(a)) return false;
          const arr = Array.from(a);
          if (arr.length < 140 || arr.length > 210) return false;
          if (!arr.every(x => typeof x === 'number' && x >= 0 && x <= 255)) return false;
          return arr[0] === 59 && arr[1] === 148 && arr[2] === 7 && arr[3] === 120; // sdenv 59 头
        } catch (e) { return false; }
      };
      const dumpFn = (fn, retArr, via) => {
        try {
          const src = Function.prototype.toString.call(fn); // 绕过 [native code] 伪装
          if (seenFns.has(src)) return;
          seenFns.add(src);
          fnHits.push({ via, retLen: retArr.length, retHead: Array.from(retArr).slice(0, 8), fnSrc: src.slice(0, 2000), fnLen: src.length });
          console.log('[DUMP] ★ 函数返回 base(' + retArr.length + 'B) via=' + via + ' fnLen=' + src.length);
          console.log('[DUMP]   源码前120: ' + src.slice(0, 120).replace(/\n/g, ' '));
        } catch (e) { }
      };
      // hook call/apply：捕获返回 base 的函数
      for (const m of ['call', 'apply']) {
        const o = w.Function.prototype[m];
        w.Function.prototype[m] = function () {
          const r = o.apply(this, arguments);
          if (isBase(r)) dumpFn(this, r, m);
          return r;
        };
      }
      // hook Array 构造方法（base 可能由这些方法产出）
      for (const C of [w.Array, w.Uint8Array]) {
        if (!C || !C.prototype) continue;
        for (const m of ['map', 'slice', 'concat', 'filter', 'flat', 'flatMap', 'subarray']) {
          const o = C.prototype[m]; if (typeof o !== 'function') continue;
          try { C.prototype[m] = function () { const r = o.apply(this, arguments); if (isBase(r)) dumpFn(C.prototype[m], r, 'proto.' + m); return r }; } catch (e) { }
        }
      }
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
      if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  console.log('[DUMP] 返回 base 的函数数: ' + fnHits.length);
  fs.writeFileSync(OUT, JSON.stringify({ fnHits }, null, 1));
  console.log('[DUMP] saved', OUT, 'done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[DUMP] FATAL:', e && e.message); process.exit(1); });
