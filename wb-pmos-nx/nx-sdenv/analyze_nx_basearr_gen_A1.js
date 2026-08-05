// 方向 A：插桩定位 basearr 明文生成点
// 思路：basearr 明文经 huffman 编码（numarrEncrypt）→ XOR keys2 → AES(keys17)。
// 在 JS 层拦截编码后的字节流（len=160 恒定），用已知 keys2 反推 numenc，huffman 解码得明文，
// 并打印 stack 定位生成函数。多段 16B 拼接需跨调用重组 → 同时 dump 全部 16B 数组供离线重组。
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const crypto = require('crypto');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = '/tmp/nx_basearr_gen_A.json';

// ---- huffman（与 extract_nx_basearr_full.js 一致）----
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2); arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getKey(arr) { for (let idx in arr) { if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8; } }
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) { getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr); getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr); }
  else { arr[tree.idx] = config; }
  return [arr, getKey(arr)];
}
const encryptConfig = getEncryptConfig(getTree());
const codeMap = {};
for (let b = 0; b < 256; b++) { const c = encryptConfig[0][b]; if (!c) continue; if (!codeMap[c.val]) codeMap[c.val] = {}; codeMap[c.val][c.key] = b; }
function numarrDecrypt(numarr) {
  const ans = []; let curLen = 0, curKey = 0;
  for (let i = 0; i < numarr.length; i++) { const byte = numarr[i];
    for (let bit = 7; bit >= 0; bit--) { const b = (byte >> bit) & 1; curKey = (curKey << 1) | b; curLen++;
      const m = codeMap[curLen]; if (m && m[curKey] !== undefined) { ans.push(m[curKey]); curKey = 0; curLen = 0; } } }
  return ans;
}

(async () => {
  console.log('[A] pid=%d start %s', process.pid, new Date().toISOString());
  const cap160 = [];   // len=160 编码流
  const arr16 = [];    // 全部 16B 数组（供重组）
  const rec16 = (a, src, stack) => { if (arr16.length < 500) arr16.push({ src, stack, data: [...a] }); };

  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      // 通用记录器
      const toArr = (x) => { try { return Array.isArray(x) ? x : (ArrayBuffer.isView(x) ? Array.from(x) : null); } catch (e) { return null; } };
      const isBytes = (a) => a && a.every(b => typeof b === 'number' && b >= 0 && b <= 255);
      const grab = (val, src) => {
        const a = toArr(val); if (!isBytes(a)) return;
        const st = (new Error()).stack || '';
        if (a.length === 160) { if (cap160.length < 10) { cap160.push({ src, stack: st, data: [...a] }); console.log('[A] hit len=160 via ' + src); } }
        else if (a.length === 16) rec16(a, src, st);
      };
      // hook Array + Uint8Array 的产生型方法
      for (const C of [w.Array, w.Uint8Array]) {
        if (!C || !C.prototype) continue;
        for (const m of ['map', 'slice', 'concat', 'filter', 'flat', 'from', 'subarray']) {
          const o = C.prototype[m]; if (typeof o !== 'function') continue;
          try { C.prototype[m] = function () { const r = o.apply(this, arguments); grab(r, C.name + '.' + m); return r; }; } catch (e) {}
        }
        const ofill = C.prototype.fill;
        if (typeof ofill === 'function') try { C.prototype.fill = function () { const r = ofill.apply(this, arguments); grab(this, C.name + '.fill'); return r; }; } catch (e) {}
      }
      // hook Uint8Array.set（接收方可能拼成 160）
      try {
        const oset = w.Uint8Array.prototype.set;
        w.Uint8Array.prototype.set = function (src2) { const r = oset.apply(this, arguments); grab(this, 'U8.set(this)'); grab(src2, 'U8.set(arg)'); return r; };
      } catch (e) {}
      w.__grabDone = true;
    },
  });

  // 等 P cookie 生成
  const cookies = await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(c); }
      lastLen = pLen;
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(c); }
    }, 700);
  });

  console.log('[A] cap160=%d arr16=%d', cap160.length, arr16.length);
  // 解 keys2（48B 最高频）用于反推 numenc
  const c48 = {};
  for (const e of arr16) { if (e.data.length !== 16) continue; }
  // 从 cookie P 解 keys2 更稳：这里先保存全部，离线重组
  fs.writeFileSync(OUT, JSON.stringify({ cap160, arr16, cookies }, null, 1));
  console.log('[A] saved %s', OUT);
  // 打印 len=160 的 stack 顶部（定位生成函数）
  cap160.forEach((e, i) => {
    const top = (e.stack || '').split('\n').slice(1, 5).join(' | ');
    console.log(`[A] cap160[${i}] src=${e.src} stack: ${top}`);
  });
  dom.window.close();
  console.log('[A] done');
  process.exit(0);
})().catch(e => { console.error('[A] FATAL:', e && e.message); process.exit(1); });
