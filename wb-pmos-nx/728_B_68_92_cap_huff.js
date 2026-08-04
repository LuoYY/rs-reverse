/**
 * 728_B_68_92_cap_huff.js
 * base[68:92] = huffman(cap 某段)？
 * cap = 明文 basearr，值域 0-113
 * huffman 编码后值域均匀（0-255）→ 匹配 base[68:92] 特征
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

// 尝试 cap 的各种切片 huffman → base[68:92] 前缀
console.log('=== cap 切片 huffman vs base[68:92] ===');
for (const s of NORMAL) {
  const seg = s.base.slice(68, 92);
  const cap = s.cap;
  const cands = [
    ['cap[0:24]', cap.slice(0, 24)],
    ['cap[20:44]', cap.slice(20, 44)],
    ['cap[24:48]', cap.slice(24, 48)],
    ['cap[0:20]', cap.slice(0, 20)],
    ['cap[18:42]', cap.slice(18, 42)],
    ['cap[22:46]', cap.slice(22, 46)],
    ['cap[0:16]+[24:40]', [...cap.slice(0, 16), ...cap.slice(24, 40)]],
  ];
  const best = [];
  for (const [name, arr] of cands) {
    const enc = nxEncrypt(arr);
    let m = 0;
    const n = Math.min(enc.length, seg.length);
    for (let i = 0; i < n; i++) { if (enc[i] === seg[i]) m++; else break; }
    if (m > 3) best.push(`${name} huff=${enc.length} 匹配=${m}`);
  }
  console.log(`nsd=${s.nsd}: ${best.join(' | ') || '无'}`);
}
