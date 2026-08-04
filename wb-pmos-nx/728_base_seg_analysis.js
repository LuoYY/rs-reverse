/**
 * 728_base_seg_analysis.js
 * 深入：base 变化段（22-25, 68-116）与 keys2 / 明文basearr marker 的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

// 各样本 base[22:26], keys2 相关
console.log('=== base[22:26] vs keys2[0:4] vs keys2[44:48] ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: base[22:26]=${s.base.slice(22, 26).join(',')} keys2[0:4]=${s.keys2.slice(0, 4).join(',')} keys2[44:48]=${s.keys2.slice(44, 48).join(',')}`);
}

// base 变化段 68-116 vs keys2 XOR
console.log('\n=== base[68:116] XOR keys2 各种偏移 ===');
// 看 base[68:84] vs keys2[0:16]
for (const s of samples) {
  const seg = s.base.slice(68, 84);
  const x = seg.map((v, i) => v ^ s.keys2[i]);
  console.log(`nsd=${s.nsd}: base[68:84]^keys2[0:16]=${x.join(',')}`);
}

// 对比：base 变化段是否 = huffman(keys2)？
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
let huffEncCfg = null;
function nxEncrypt(numarr) {
  if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
  const ans = [];
  let one = 0, two = 0;
  for (let i = 0; i < numarr.length; i++) {
    const cfg = huffEncCfg[numarr[i]];
    one = one << cfg.val | cfg.key;
    two += cfg.val;
    while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
  }
  if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
  return ans;
}
console.log('\n=== huffman(keys2) vs base[22:22+len] ===');
for (const s of samples) {
  const hk = nxEncrypt(s.keys2);
  console.log(`nsd=${s.nsd}: huff(keys2) len=${hk.length} 前16=${hk.slice(0, 16).join(',')}`);
  console.log(`  base[22:38]=${s.base.slice(22, 38).join(',')}`);
}
