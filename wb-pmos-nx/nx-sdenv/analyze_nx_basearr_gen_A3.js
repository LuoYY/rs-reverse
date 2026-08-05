// 方向 A3：sdenv 数组陷阱捕获 basearr 明文（179 开头）+ keys2，再用 huffman 编码验证。
// 用 nx_client 同款"等 P cookie"逻辑，确保 VM 跑完。陷阱放宽捕获所有数组（含 push 流），
// 离线按 [0]=179 过滤明文候选。
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = '/tmp/nx_basearr_gen_A3.json';

// huffman 编码（与 extract 一致，用于验证明文）
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) { for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } } arr.push(item); }
  while (arr.length > 1) { const [one, two] = arr.slice(0, 2); arr = arr.slice(2); parse({ total: one.total + two.total, first: one, second: two }); }
  return arr[0];
}
function getKey(arr) { for (let idx in arr) { if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8; } }
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) { getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr); getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr); }
  else { arr[tree.idx] = config; }
  return [arr, getKey(arr)];
}
const encCfg = getEncryptConfig(getTree())[0];
const PADDING = 0x68; // nx getKey 常量
function numarrEncrypt(numarr) {
  const ans = []; let curLen = 0, curKey = 0;
  for (let i = 0; i < numarr.length; i++) {
    const c = encCfg[numarr[i]]; if (!c) continue;
    curKey = (curKey << c.val) | c.key; curLen += c.val;
    while (curLen >= 8) { curLen -= 8; ans.push((curKey >> curLen) & 255); }
  }
  if (curLen > 0) ans.push(((curKey << (8 - curLen)) | (PADDING >> curLen)) & 255);
  return ans;
}

(async () => {
  console.log('[A3] pid=%d start %s', process.pid, new Date().toISOString());
  const captured = [];   // 所有候选数组快照
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      const rec = (arr, src) => {
        if (captured.length >= 400) return;
        let a; try { a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null); } catch (e) { return; }
        if (!a || !a.length || a.length < 16) return;
        if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
        captured.push({ src, len: a.length, data: [...a] });
      };
      for (const C of [w.Array, w.Uint8Array]) {
        if (!C || !C.prototype) continue;
        for (const m of ['map', 'slice', 'concat', 'filter', 'flat', 'subarray', 'fill']) {
          const o = C.prototype[m]; if (typeof o !== 'function') continue;
          try { C.prototype[m] = function () { const r = o.apply(this, arguments); rec(m === 'fill' ? this : r, C.name + '.' + m); return r; }; } catch (e) {}
        }
      }
      try { const oset = w.Uint8Array.prototype.set; w.Uint8Array.prototype.set = function (s2) { const r = oset.apply(this, arguments); rec(this, 'U8.set'); return r; }; } catch (e) {}
      // push 流：数组增长到 179 开头且 >=160 时快照
      try {
        const opush = w.Array.prototype.push;
        w.Array.prototype.push = function (...items) {
          const r = opush.apply(this, items);
          try { if (this[0] === 179 && this.length >= 160 && this.length <= 400) rec([...this], 'push179'); } catch (e) {}
          return r;
        };
      } catch (e) {}
    },
  });
  const w = dom.window;
  // 等 P cookie（nx_client 同款）
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
  console.log('[A3] captured=%d', captured.length);
  // 过滤明文候选：[0]=179
  const plain = captured.filter(e => e.data[0] === 179 && e.len >= 60 && e.len <= 400);
  // 去重
  const seen = new Set(); const cands = [];
  for (const e of plain) { const k = e.data.join(','); if (!seen.has(k)) { seen.add(k); cands.push(e); } }
  console.log('[A3] basearr(179) 候选=%d', cands.length);
  const out = [];
  cands.forEach((e, i) => {
    const enc = numarrEncrypt(e.data);
    out.push({ src: e.src, len: e.len, data: e.data, huffLen: enc.length });
    console.log(`[A3] 候选[${i}] len=${e.len} src=${e.src} huffLen=${enc.length} head=${e.data.slice(0, 24).join(',')}`);
  });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('[A3] saved %s', OUT);
  dom.window.close();
  console.log('[A3] done');
  process.exit(0);
})().catch(e => { console.error('[A3] FATAL:', e && e.message); process.exit(1); });
