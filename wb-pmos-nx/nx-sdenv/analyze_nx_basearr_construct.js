// 方向 2（sdenv 突破口）：抓 base 全长数组的构造过程。
// 在 sdenv/jsdom 里 hook 数组写操作，当检测到 sdenv base 固定头（59,148,7,120）出现时，
// 记录该数组的构造栈（哪个函数、push 了什么），定位 41B 内层 VM 写入点。
// 同时抓 cap（challenge 明文）作对照。
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = '/tmp/nx_basearr_construct.json';

(async () => {
  console.log('[CTOR] pid=%d start', process.pid);
  const hits = []; // 抓到的 base 候选数组
  const headCount = {}; // 140-200B 数组的头分布
  const SDENV_HEAD = [59, 148, 7, 120];
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.221.249.98:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      const isBaseCand = (a) => {
        if (!Array.isArray(a) && !ArrayBuffer.isView(a)) return false;
        const arr = Array.from(a);
        if (arr.length < 140 || arr.length > 200) return false;
        if (!arr.every(x => typeof x === 'number' && x >= 0 && x <= 255)) return false;
        return true; // 抓所有 140-200B 纯字节数组，事后看头
      };
      const rec = (arr, src) => {
        try {
          const a = Array.from(arr);
          if (isBaseCand(a)) {
            const h = a.slice(0, 4).join(',');
            headCount[h] = (headCount[h] || 0) + 1;
            if (hits.length < 200) {
              const stack = new Error().stack.split('\n').slice(2, 8).join('|');
              hits.push({ src, len: a.length, arr: a.slice(0, 30), stack });
            }
          }
        } catch (e) { }
      };
      // hook Array 常用构造方法
      for (const C of [w.Array, w.Uint8Array]) {
        if (!C || !C.prototype) continue;
        for (const m of ['map', 'slice', 'concat', 'filter', 'flat', 'flatMap', 'subarray', 'from', 'of']) {
          const o = C.prototype ? C.prototype[m] : null;
          if (typeof o === 'function') {
            try { C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r, 'proto.' + m); return r }; } catch (e) { }
          }
        }
      }
      // hook Array.from/of（静态）
      try { const ofrom = w.Array.from; w.Array.from = function () { const r = ofrom.apply(this, arguments); rec(r, 'Array.from'); return r }; } catch (e) { }
      // hook push（数组逐步构造）——太慢，只在长度接近时检查
      try {
        const opush = w.Array.prototype.push;
        w.Array.prototype.push = function () {
          const r = opush.apply(this, arguments);
          if (this.length >= 140 && this.length <= 200) rec(this, 'push');
          return r;
        };
      } catch (e) { }
    },
  });
  const w = dom.window;
  // 等 P cookie 生成
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
    }, 500);
  });
  console.log('[CTOR] 抓到 base 候选数: ' + hits.length);
  console.log('[CTOR] 140-200B 数组头分布: ' + JSON.stringify(headCount));
  hits.forEach((h, i) => {
    console.log('[CTOR] #' + i + ' len=' + h.len + ' src=' + h.src + ' 头=' + h.arr.slice(0, 8).join(','));
  });
  fs.writeFileSync(OUT, JSON.stringify({ hits, headCount }, null, 1));
  console.log('[CTOR] saved', OUT, 'done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[CTOR] FATAL:', e && e.message); process.exit(1); });
