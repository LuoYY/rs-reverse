/**
 * 728_base_seg_decode.js
 * 分段 huffman 解码 base：如果 base 是多段 huffman 编码拼接，每段解码可读
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
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

const segs = [
  { name: 'A[0:22]', s: 0, e: 22 },
  { name: 'B[22:26]', s: 22, e: 26 },
  { name: 'C[26:56]', s: 26, e: 56 },
  { name: 'D[56:68]', s: 56, e: 68 },
  { name: 'E[68:116]', s: 68, e: 116 },
  { name: 'F[116:138]', s: 116, e: 138 },
  { name: 'G[138:]', s: 138, e: 999 },
];

console.log('=== base 分段 huffman 解码 ===');
for (const s of samples) {
  console.log(`\nnsd=${s.nsd}:`);
  for (const sg of segs) {
    const end = Math.min(sg.e, s.base.length);
    if (sg.s >= end) continue;
    const segArr = s.base.slice(sg.s, end);
    const dec = huffmanDecodeRaw(segArr);
    const asStr = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
    const printable = dec.filter(v => v >= 32 && v < 127).length;
    console.log(`  ${sg.name} 编码${segArr.length}B→解码${dec.length}: [${asStr}] (可读${printable}/${dec.length})`);
  }
}
