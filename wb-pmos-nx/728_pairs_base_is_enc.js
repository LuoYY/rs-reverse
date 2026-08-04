/**
 * 728_pairs_base_is_enc.js
 * 核心测试：base 是否 = nxEncrypt(明文 basearr) 或 nxEncrypt(b86[2:140])
 * 用新数据集（10 样本，含 b86）
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

console.log('=== base vs nxEncrypt(b86[2:140]) ===');
for (const s of samples) {
  const plain = s.b86.slice(2, 140);
  const enc = nxEncrypt(plain);
  const base = s.base;
  // 前缀匹配
  let m = 0;
  const n = Math.min(enc.length, base.length);
  for (let i = 0; i < n; i++) { if (enc[i] === base[i]) m++; else break; }
  console.log(`nsd=${s.nsd}: enc=${enc.length} base=${base.length} 前缀匹配=${m}`);
}

// base 是否是 nxEncrypt(b86 某段)？
console.log('\n=== nxEncrypt(b86[2:140]) 在 base 中搜索 ===');
for (const s of samples) {
  const enc = nxEncrypt(s.b86.slice(2, 140));
  const bStr = s.base.join(',');
  const eStr = enc.join(',');
  console.log(`nsd=${s.nsd}: ${bStr.indexOf(eStr) !== -1 ? '★★ 完全出现' : '未出现'}`);
}

// 尝试：base[22:] 是否 = nxEncrypt(明文basearr)？明文basearr = b86[2:140]
console.log('\n=== base[22:] vs nxEncrypt(b86[2:140]) ===');
for (const s of samples) {
  const enc = nxEncrypt(s.b86.slice(2, 140));
  const seg = s.base.slice(22);
  let m = 0;
  const n = Math.min(enc.length, seg.length);
  for (let i = 0; i < n; i++) { if (enc[i] === seg[i]) m++; else break; }
  console.log(`nsd=${s.nsd}: enc=${enc.length} base[22:]=${seg.length} 前缀匹配=${m}`);
  if (m > 3) {
    console.log(`  enc[0:16]=${enc.slice(0, 16).join(',')}`);
    console.log(`  seg[0:16]=${seg.slice(0, 16).join(',')}`);
  }
}
