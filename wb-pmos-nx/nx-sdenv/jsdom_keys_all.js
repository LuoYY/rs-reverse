// 提取 nx 完整 keys[0..44]（所有字节数组，含 keys[7] 等小数组）
const fs = require('fs');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

process.on('message', async (msg) => {
  try {
    const { nsd, cd, outerJsPath } = msg;
    const { JSDOM } = require('sdenv-jsdom');
    const outerJsCode = fs.readFileSync(outerJsPath, 'utf8');

    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
      url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
      runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const { window } = dom;
    window.$_ts = { nsd, cd };

    // 抓所有 1-64 字节数组（keys 候选），按出现频率统计
    const found = [];
    const rec = (arr) => {
      if (!arr || typeof arr !== 'object') return;
      let a;
      try { a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null); } catch (e) { return; }
      if (!a) return;
      if (a.length < 1 || a.length > 64) return;
      if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
      if (found.length < 500) found.push([...a]);
    };
    for (const C of [window.Array, window.Uint8Array]) {
      if (!C) continue;
      for (const m of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
        const o = C.prototype[m];
        if (typeof o === 'function') {
          C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r; };
        }
      }
    }
    const origFrom = window.Array.from;
    if (origFrom) window.Array.from = function () { const r = origFrom.apply(this, arguments); rec(r); return r; };

    try { window.eval(outerJsCode); } catch (e) { globalThis.__evalErr = e.message; }

    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      await new Promise(r => setTimeout(r, 300));
      const sizes = {};
      for (const a of found) sizes[a.length] = (sizes[a.length] || 0) + 1;
      if ((sizes[16] || 0) >= 3) break;
    }

    // 按长度分组，取每组的 TOP 数组（keys 是稳定出现的）
    const byLen = {};
    for (const a of found) {
      const key = a.join(',');
      if (!byLen[a.length]) byLen[a.length] = {};
      byLen[a.length][key] = (byLen[a.length][key] || 0) + 1;
    }
    const keys = {};
    for (const [len, cnt] of Object.entries(byLen)) {
      const sorted = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
      keys[len] = { top: sorted.slice(0, 5).map(([k, v]) => ({ data: k.split(',').map(Number), count: v })), unique: Object.keys(cnt).length };
    }

    window.close();
    process.send({
      ok: true,
      keysByLen: keys,
      evalErr: globalThis.__evalErr || null,
      total: found.length,
    });
  } catch (e) {
    process.send({ ok: false, error: e.message + '\n' + e.stack });
  }
  process.exit(0);
});
