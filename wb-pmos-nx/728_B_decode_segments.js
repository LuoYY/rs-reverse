/**
 * 728_B_decode_segments.js
 * 把 base 各段整体 huffman 解码，看是否得到有意义内容
 * 假设：base = [固定头22] + [huffman编码的数据段] + ...
 * 值域 0-255 均匀 → base 本身就是 huffman 编码输出？
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;
const NORMAL = samples.filter(s => s.base[26] === 233);

function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
function huffmanDecodeRaw(enc) {
  const encCfg = getEncCfg(getTree());
  const byLenMap = {}; let maxL = 0;
  for (let idx = 0; idx < 256; idx++) {
    const c = encCfg[idx];
    if (!c) continue;
    if (!byLenMap[c.val]) byLenMap[c.val] = {};
    byLenMap[c.val][c.key] = idx;
    if (c.val > maxL) maxL = c.val;
  }
  const ans = [];
  let key = 0, val = 0;
  for (let i = 0; i < enc.length; i++) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((enc[i] >> b) & 1);
      val++;
      const mm = byLenMap[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
  return ans;
}

console.log('=== base 各段 huffman 解码（可读性检查）===');
for (const s of NORMAL.slice(0, 3)) {
  const b = s.base;
  console.log(`\nnsd=${s.nsd}:`);
  const segs = {
    'A[0:22]': [0, 22],
    'B[22:29]': [22, 29],
    'C[29:68]': [29, 68],
    'D[68:92]': [68, 92],
    'E[92:116]': [92, 116],
    'F[116:140]': [116, 140],
    'G[140:]': [140, b.length],
    'H[29:92]': [29, 92],
    'I[68:140]': [68, 140],
    'J[29:140]': [29, 140],
  };
  for (const [name, [st, en]] of Object.entries(segs)) {
    const end = Math.min(en, b.length);
    const seg = b.slice(st, end);
    const dec = huffmanDecodeRaw(seg);
    const asStr = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
    console.log(`  ${name} ${seg.length}B→${dec.length}B: [${asStr.substring(0, 60)}]`);
  }
}
