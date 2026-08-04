/**
 * 728_B_base_is_enc2.js
 * 测试 base[22:] 是否 = nxEncrypt(明文basearr + 各种后缀) 
 * 及 base[68:] 是否 = nxEncrypt(b86[2:某] + keys2)
 * 目标是找 base = f(cd) 的公式
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

const s0 = samples[0];
const plain = s0.b86.slice(2, 140);
console.log('base len:', s0.base.length, 'base[22:] len:', s0.base.length - 22);
console.log('明文basearr len:', plain.length);
console.log('nxEncrypt(明文):', nxEncrypt(plain).length);

// 各种候选组合
const cands = {
  plain: plain,
  plain_k2: [...plain, ...s0.keys2],
  k2_plain: [...s0.keys2, ...plain],
  plain_68: plain.slice(0, 68),
  plain_22: plain.slice(22),
};

console.log('\n=== nxEncrypt 长度 vs base[22:] ===');
for (const [name, arr] of Object.entries(cands)) {
  const enc = nxEncrypt(arr);
  console.log(`${name}: arr=${arr.length} enc=${enc.length} vs base[22:]=${s0.base.length - 22}`);
}

// 尝试 base[22:] == nxEncrypt(明文 + keys2) 前缀匹配
console.log('\n=== 前缀匹配 ===');
const baseTail = s0.base.slice(22);
for (const [name, arr] of Object.entries(cands)) {
  const enc = nxEncrypt(arr);
  let m = 0;
  const n = Math.min(enc.length, baseTail.length);
  for (let i = 0; i < n; i++) { if (enc[i] === baseTail[i]) m++; else break; }
  console.log(`${name}: 前缀匹配=${m}`);
  if (m > 3) {
    console.log(`  enc[0:16]=${enc.slice(0, 16).join(',')}`);
    console.log(`  tail[0:16]=${baseTail.slice(0, 16).join(',')}`);
  }
}

// base[68:] 长度与 nxEncrypt 候选对比
console.log('\n=== base[68:] vs 候选 ===');
const tail68 = s0.base.slice(68);
for (const [name, arr] of Object.entries(cands)) {
  const enc = nxEncrypt(arr);
  let m = 0;
  const n = Math.min(enc.length, tail68.length);
  for (let i = 0; i < n; i++) { if (enc[i] === tail68[i]) m++; else break; }
  console.log(`${name}: enc=${enc.length} tail68=${tail68.length} 前缀匹配=${m}`);
}
