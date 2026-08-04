/**
 * 728_B_combo3.js
 * 系统测试 base[68:] = nxEncrypt(数组组合) 的所有可能性
 * base[68:] 长度 97-103，值域 0-255
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

// base[68:] 各样本
for (const s of samples) {
  const tail = s.base.slice(68);
  const plain = s.b86.slice(2, 140);
  const k2 = s.keys2;
  // 候选数组
  const cands = {
    k2: k2,
    plain: plain,
    k2_plain: [...k2, ...plain],
    plain_k2: [...plain, ...k2],
    k2_plain_k2: [...k2, ...plain, ...k2],
    plain_k2_plain: [...plain, ...k2, ...plain],
    k2x2: [...k2, ...k2],
  };
  const results = [];
  for (const [name, arr] of Object.entries(cands)) {
    const enc = nxEncrypt(arr);
    // 前缀匹配
    let m = 0;
    const n = Math.min(enc.length, tail.length);
    for (let i = 0; i < n; i++) { if (enc[i] === tail[i]) m++; else break; }
    results.push(`${name}(${arr.length}→${enc.length}):${m}`);
  }
  console.log(`nsd=${s.nsd} tail=${tail.length}: ${results.join(' | ')}`);
}
