// 方向 A4：放宽数组陷阱，dump 全部捕获数组（不限长度/类型），诊断明文到底藏哪。
// 解决 A3 captured=64 但 179 候选=0 的盲区：可能明文经 Uint8Array 索引赋值/不同构造路径，
// 或首字节不是 179（明文是 numarrJoin 结构，可能首字节是段头 3/2，179 在中段）。
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = '/tmp/nx_basearr_gen_A4.json';

(async () => {
  console.log('[A4] pid=%d start %s', process.pid, new Date().toISOString());
  const captured = [];
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      const rec = (arr, src) => {
        if (captured.length >= 2000) return;
        let a; try { a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null); } catch (e) { return; }
        if (!a || !a.length) return;
        if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
        captured.push({ src, len: a.length, data: [...a] });
      };
      for (const C of [w.Array, w.Uint8Array]) {
        if (!C || !C.prototype) continue;
        for (const m of ['map', 'slice', 'concat', 'filter', 'flat', 'subarray', 'fill', 'join']) {
          const o = C.prototype[m]; if (typeof o !== 'function') continue;
          try { C.prototype[m] = function () { const r = o.apply(this, arguments); rec(m === 'fill' ? this : r, C.name + '.' + m); return r; }; } catch (e) {}
        }
      }
      try { const oset = w.Uint8Array.prototype.set; w.Uint8Array.prototype.set = function (s2) { const r = oset.apply(this, arguments); rec(this, 'U8.set'); rec(s2, 'U8.set(arg)'); return r; }; } catch (e) {}
      try { const ofrom = w.Array.from; w.Array.from = function () { const r = ofrom.apply(this, arguments); rec(r, 'Array.from'); return r; }; } catch (e) {}
      // Uint8Array 构造器
      try {
        const OU8 = w.Uint8Array;
        const NU8 = function (a) { const r = new OU8(a); if (r.length >= 16) rec(Array.from(r), 'new U8'); return r; };
        NU8.prototype = OU8.prototype; w.Uint8Array = NU8;
      } catch (e) {}
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
    }, 700);
  });
  console.log('[A4] captured=%d', captured.length);
  // 长度分布
  const dist = {};
  captured.forEach(e => { const b = e.len < 16 ? 's' : e.len < 64 ? 'm' : e.len < 128 ? 'L' : e.len < 200 ? 'XL' : 'XXL'; dist[b] = (dist[b] || 0) + 1; });
  console.log('[A4] len dist:', JSON.stringify(dist));
  // 含 179 的数组（首字节 or 任何位置）
  const with179 = captured.filter(e => e.data.includes(179) && e.len >= 60 && e.len <= 400);
  const start179 = captured.filter(e => e.data[0] === 179);
  const lenInRange = captured.filter(e => e.len >= 150 && e.len <= 200);
  console.log('[A4] start179=%d  with179(60-400)=%d  len150-200=%d', start179.length, with179.length, lenInRange.length);
  const dump = { dist, start179: start179.slice(0, 10), with179: with179.slice(0, 10), lenInRange: lenInRange.slice(0, 20), all: captured.slice(0, 300) };
  fs.writeFileSync(OUT, JSON.stringify(dump, null, 1));
  lenInRange.slice(0, 20).forEach((e, i) => console.log(`[A4] len150-200[${i}] len=${e.len} src=${e.src} head=${e.data.slice(0, 16).join(',')}`));
  with179.slice(0, 10).forEach((e, i) => console.log(`[A4] with179[${i}] len=${e.len} src=${e.src} idx179=${e.data.indexOf(179)} head=${e.data.slice(0, 12).join(',')}`));
  console.log('[A4] saved %s', OUT);
  dom.window.close();
  console.log('[A4] done');
  process.exit(0);
})().catch(e => { console.error('[A4] FATAL:', e && e.message); process.exit(1); });
