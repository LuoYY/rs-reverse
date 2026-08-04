/**
 * jsdom_keys_child.js — 子进程：jsdom 数组陷阱提取 keys（qwen38 同款）
 *
 * 输入：process.send({ nsd, cd, outerJsPath })
 * 输出：process.send({ keys16, keys17, keys2, counts })
 */
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

    // 数组陷阱：抓 16/48 字节全字节数组
    const found = [];
    const rec = (arr) => {
      if (!arr || typeof arr !== 'object') return;
      const a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null);
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

    // 执行外层 VM（同步；错误捕获不中断）
    // 注意：外层 JS 可能因环境缺方法抛错（如 reading '3'），但 setTimeout 驱动的
    // 内层 VM 可能已注册回调，因此错误后仍需轮询等待 keys 数组出现
    try { window.eval(outerJsCode); } catch (e) { globalThis.__evalErr = e.message; }

    // 轮询等待 keys 出现（内层 VM 由 setTimeout 驱动，最多 12s）
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      await new Promise(r => setTimeout(r, 300));
      let cur = 0;
      for (const a of found) { if (a.length === 16) cur++; }
      if (cur >= 3) break;
    }

    // 识别 keys
    const c16 = {}, c48 = {};
    for (const a of found) {
      const key = a.join(',');
      if (a.length === 16) c16[key] = (c16[key] || 0) + 1;
      if (a.length === 48) c48[key] = (c48[key] || 0) + 1;
    }

    // keys16: 出现次数最多
    let keys16 = null, max16 = 0;
    for (const [k, v] of Object.entries(c16)) {
      if (v > max16) { max16 = v; keys16 = k.split(',').map(Number); }
    }

    // keys17: 后 8 字节 shape
    let keys17 = null, max17 = 0;
    for (const [k, v] of Object.entries(c16)) {
      const a = k.split(',').map(Number);
      if (keys16 && JSON.stringify(a) === JSON.stringify(keys16)) continue;
      const t8 = a.slice(8);
      if (t8[1] >= 128 && t8[4] >= 2 && t8[4] <= 7 && t8[6] >= 4 && t8[7] >= 2) {
        if (v > max17) { max17 = v; keys17 = a; }
      }
    }

    // keys2: 出现次数最多的 48B
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
