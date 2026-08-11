// huffman 解码 128B/230B 数组，对比真实 base
const calls = require('./nx_mD_calls.json');
const real = require('./nx_cross_session.json');

// huffman 树
function getTree() {
  let a = [];
  for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i });
  a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return } a.push(it) }
  while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) }
  return a[0];
}
function gEC(t, c = { key: 0, val: 0 }, arr = []) {
  if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) }
  else arr[t.idx] = c;
  return arr;
}
const cfg = gEC(getTree());
const byLen = {}; let maxL = 0;
for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val; }
function hdec(e) {
  const ans = []; let key = 0, val = 0;
  for (const byte of e) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((byte >> b) & 1); val++;
      const mm = byLen[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
  return ans;
}

const c128 = calls.filter(c => c.after && c.after.length === 128);
const c230 = calls.filter(c => c.after && c.after.length === 230);

// 解码 128B #0（含 179 的位置 @81？还是无）
for (let i = 0; i < 3; i++) {
  const d = hdec(c128[i].after);
  console.log('128B #' + i + ' huffman 解码 len=' + d.length + ' head=' + d.slice(0, 16).join(','));
}
// 230B #0
const d230 = hdec(c230[0].after);
console.log('230B #0 huffman 解码 len=' + d230.length + ' head=' + d230.slice(0, 16).join(','));
console.log('  含179 @' + d230.indexOf(179));

// 对比真实 base
const A = real.A.base;
console.log('\n真实 base len=' + A.length + ' head=' + A.slice(0, 22).join(','));
console.log('真实 base 含179 @' + A.indexOf(179));

// 128B 数组 vs 真实 base 的相似性（找 numarrEncrypt(base) 是否出现在 128B 中）
// numarrEncrypt(base) 需要 keys2 XOR，先看原始 128B 与 base 编码的关系
console.log('\n=== 128B 与 base 编码对比 ===');
// 用 nx_cross_session 的 base + keys2 生成 numarrEncrypt(base)（需要 parser）
try {
  const ROOT = require('path').join(__dirname, '..', '..');
  require('module-alias')(require('path').dirname(require(require('path').join(ROOT, 'utils/paths.js')).package));
  require(require('path').join(ROOT, 'src/handler/parser/constData.js')).init();
  const parser = require(require('path').join(ROOT, 'src/handler/parser/index.js'));
  const enc = parser.numarrEncrypt(A);
  console.log('numarrEncrypt(base) len=' + enc.length + ' head=' + enc.slice(0, 20).join(','));
  // 找 enc 在 128B 中的最长匹配
  for (let k = 0; k < Math.min(3, c128.length); k++) {
    const arr = c128[k].after;
    let best = 0, bestPos = -1;
    for (let i = 0; i <= arr.length - 8; i++) {
      let l = 0;
      while (l < Math.min(enc.length, arr.length - i) && enc[l] === arr[i + l]) l++;
      if (l > best) { best = l; bestPos = i; }
    }
    console.log('128B #' + k + ' 与 numarrEncrypt(base) 最长匹配: ' + best + ' @' + bestPos);
  }
  // 230B
  const arr230 = c230[0].after;
  let best = 0, bestPos = -1;
  for (let i = 0; i <= arr230.length - 8; i++) {
    let l = 0;
    while (l < Math.min(enc.length, arr230.length - i) && enc[l] === arr230[i + l]) l++;
    if (l > best) { best = l; bestPos = i; }
  }
  console.log('230B 与 numarrEncrypt(base) 最长匹配: ' + best + ' @' + bestPos);
} catch (e) { console.log('parser 加载失败:', e.message); }
