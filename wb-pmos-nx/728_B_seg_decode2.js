/**
 * 728_B_seg_decode2.js
 * 假设：base = [固定段 huffman] + [会话段 huffman] + [固定段 huffman] + ...
 * 分段 huffman 解码，看每段是否得到可读/有意义数据
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

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

const s0 = samples[0];
const b = s0.base;
const segments = [
  ['A[0:22]', 0, 22],
  ['B[22:29]', 22, 29],
  ['C[29:68]', 29, 68],
  ['D[68:88]', 68, 88],
  ['E[88:90]', 88, 90],
  ['F[90:110]', 90, 110],
  ['G[110:130]', 110, 130],
  ['H[130:150]', 130, 150],
  ['I[150:168]', 150, 168],
];

console.log('=== base 分段 huffman 解码 (nsd=' + s0.nsd + ') ===');
for (const [name, st, en] of segments) {
  const seg = b.slice(st, en);
  const dec = huffmanDecodeRaw(seg);
  const asStr = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
  console.log(`${name} ${seg.length}B→${dec.length}B: [${asStr}]`);
}

// 各段解码结果跨会话对比
console.log('\n=== 各段解码跨会话对比 ===');
const segDefs = [['C[29:68]', 29, 68], ['D[68:88]', 68, 88], ['F[90:110]', 90, 110]];
for (const [name, st, en] of segDefs) {
  console.log(`\n--- ${name} ---`);
  for (const s of samples) {
    const seg = s.base.slice(st, en);
    const dec = huffmanDecodeRaw(seg);
    const asStr = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
    console.log(`nsd=${s.nsd}: [${asStr}]`);
  }
}
