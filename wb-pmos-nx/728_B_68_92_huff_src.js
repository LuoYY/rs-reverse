/**
 * 728_B_68_92_huff_src.js
 * base[68:92] 24B 可能是 huffman 编码的短数据
 * 候选源：keys2 切片 / nsd / cd 片段 / cap marker 段
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

// 候选：keys2 各切片 huffman 编码长度 vs 24
console.log('=== keys2 切片 huffman 长度 ===');
for (const s of NORMAL.slice(0, 2)) {
  const k2 = s.keys2;
  const cands = {
    k2_0_16: nxEncrypt(k2.slice(0, 16)).length,
    k2_16_32: nxEncrypt(k2.slice(16, 32)).length,
    k2_32_48: nxEncrypt(k2.slice(32, 48)).length,
    k2_0_20: nxEncrypt(k2.slice(0, 20)).length,
    k2_0_24: nxEncrypt(k2.slice(0, 24)).length,
    k2_0_22: nxEncrypt(k2.slice(0, 22)).length,
    k2_0_25: nxEncrypt(k2.slice(0, 25)).length,
  };
  console.log(`nsd=${s.nsd}:`, JSON.stringify(cands));
}

// 尝试 base[68:92] 是否是 huffman(keys2[:N]) 的输出
console.log('\n=== base[68:92] vs huff(keys2切片) 前缀匹配 ===');
for (const s of NORMAL) {
  const seg = s.base.slice(68, 92);
  const k2 = s.keys2;
  const best = [];
  for (let N = 16; N <= 28; N++) {
    const enc = nxEncrypt(k2.slice(0, N));
    let m = 0;
    const n = Math.min(enc.length, seg.length);
    for (let i = 0; i < n; i++) { if (enc[i] === seg[i]) m++; else break; }
    if (m > 2) best.push(`k2[:${N}] huff=${enc.length} 匹配=${m}`);
  }
  console.log(`nsd=${s.nsd}: ${best.join(' | ') || '无'}`);
}
