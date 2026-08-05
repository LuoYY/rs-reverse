// 在 sdenv 完整环境中运行外层 VM，hook keys 生成 + 观察 $_ts 内部状态
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  // 先获取 nsd/cd
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();

  // 第二个 dom：hook keys
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
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window, sdenv) {
      // 注入 nsd/cd + keys 陷阱
      window.$_ts = { nsd, cd };
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
    },
  });
  // 等 cookie 生成
  await new Promise(r => setTimeout(r, 20000));
  // 收集 $_ts 键
  const tsKeys = Object.keys(dom.window.$_ts || {});
  console.log('sdenv $_ts keys:', tsKeys.join(','));
  console.log('found 数组数:', found.length);
  // keys16/17/2 识别
  const c16 = {}, c48 = {};
  for (const a of found) {
    const key = a.join(',');
    if (a.length === 16) c16[key] = (c16[key] || 0) + 1;
    if (a.length === 48) c48[key] = (c48[key] || 0) + 1;
  }
  let k16 = null, mx = 0;
  for (const [k, v] of Object.entries(c16)) { if (v > mx) { mx = v; k16 = k.split(',').map(Number); } }
  let k17 = null;
  for (const [k, v] of Object.entries(c16)) {
    const a = k.split(',').map(Number);
    if (k16 && JSON.stringify(a) === JSON.stringify(k16)) continue;
    const t8 = a.slice(8);
    if (t8[1] >= 128 && t8[4] >= 2 && t8[4] <= 7 && t8[6] >= 4 && t8[7] >= 2) { k17 = a; break; }
  }
  let k2 = null, mx48 = 0;
  for (const [k, v] of Object.entries(c48)) { if (v > mx48) { mx48 = v; k2 = k.split(',').map(Number); } }
  console.log('k16:', k16 ? k16.join(',') : 'none');
  console.log('k17:', k17 ? k17.join(',') : 'none');
  console.log('k2:', k2 ? k2.slice(0, 8).join(',') : 'none');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
