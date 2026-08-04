/**
 * 728_cd_base_pairs_analysis.js
 * 用 team-lead 新数据集 /tmp/nx_cd_base_pairs.json
 * 重点：
 * 1. base[29-67] 固定段是什么（huffman 解码？）
 * 2. base[68+] 与 cd/b86 的关系
 * 3. base[22-28] 与 cd 的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== 10 样本 base 全量 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd} len=${s.base.length}: ${s.base.join(',')}`);
}

// base[29-67] 固定段 huffman 解码尝试
console.log('\n=== base[29:68] 固定段 huffman 解码 ===');
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

// base[29:68] 固定段
const s0 = samples[0];
const fixedSeg = s0.base.slice(29, 68);
console.log('base[29:68] 固定段:', fixedSeg.join(','));
const dec = huffmanDecodeRaw(fixedSeg);
console.log('huffman 解码:', dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));

// base[29:68] 是否可读（直接 ASCII）
console.log('直接 ASCII:', fixedSeg.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));

// base[0:22] 固定头直接 ASCII
const head = s0.base.slice(0, 22);
console.log('base[0:22] 直接 ASCII:', head.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));
