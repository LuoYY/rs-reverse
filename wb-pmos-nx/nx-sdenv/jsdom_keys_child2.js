/**
 * jsdom_keys_child2.js — 子进程：sdenv 完整补环境 + jsdom 数组陷阱提取 keys
 *
 * 与 jsdom_keys_child.js 的区别：用 sdenv 的 jsdomFromText（补全环境）
 * 而不是裸 sdenv-jsdom，确保外层 JS 完整执行（keys 稳定提取）。
 */
const fs = require('fs');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

process.on('message', async (msg) => {
  try {
    const { nsd, cd, outerJsPath } = msg;
    const { jsdomFromText } = require('sdenv');
    const outerJsCode = fs.readFileSync(outerJsPath, 'utf8');

    const dom = await jsdomFromText('<!DOCTYPE html><html><head></head><body></body></html>', {
      url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
      runScripts: 'outside-only',
      consoleConfig: { error: new Function() },
    });
    const { window } = dom;
    window.$_ts = { nsd, cd };

    // 数组陷阱：抓 16/48 字节全字节数组
    const found = [];
    const rec = (arr) => {
      if (!arr || typeof arr !== 'object') return;
      let a;
      try { a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null); } catch (e) { return; }
      if (!a) return;
      if (a.length !== 16 && a.length !== 48) return;
      if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
      if (found.length < 200) found.push([...a]);
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

    // 执行外层 VM
    try { window.eval(outerJsCode); } catch (e) { globalThis.__evalErr = e.message; }

    // 轮询等待 keys 出现（最多 10s）
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      await new Promise(r => setTimeout(r, 300));
      let cur = 0;
      for (const a of found) { if (a.length === 16) cur++; }
      if (cur >= 3) break;
    }

    const c16 = {}, c48 = {};
    for (const a of found) {
      const key = a.join(',');
      if (a.length === 16) c16[key] = (c16[key] || 0) + 1;
      if (a.length === 48) c48[key] = (c48[key] || 0) + 1;
    }
    let keys16 = null, max16 = 0;
    for (const [k, v] of Object.entries(c16)) {
      if (v > max16) { max16 = v; keys16 = k.split(',').map(Number); }
    }
    let keys17 = null, max17 = 0;
    for (const [k, v] of Object.entries(c16)) {
      const a = k.split(',').map(Number);
      if (keys16 && JSON.stringify(a) === JSON.stringify(keys16)) continue;
      const t8 = a.slice(8);
      if (t8[1] >= 128 && t8[4] >= 2 && t8[4] <= 7 && t8[6] >= 4 && t8[7] >= 2) {
        if (v > max17) { max17 = v; keys17 = a; }
      }
    }
    let keys2 = null, max48 = 0;
    for (const [k, v] of Object.entries(c48)) {
      if (v > max48) { max48 = v; keys2 = k.split(',').map(Number); }
    }

    window.close();
    process.send({
      ok: true,
      keys16, keys17, keys2,
      evalErr: globalThis.__evalErr || null,
      counts: { c16: Object.keys(c16).length, c48: Object.keys(c48).length, total: found.length },
    });
  } catch (e) {
    process.send({ ok: false, error: e.message + '\n' + e.stack });
  }
  process.exit(0);
});
