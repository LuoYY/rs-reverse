/**
 * 728_pairs_enc_len.js
 * 寻找 base[68:]（97-103B）的来源：可能是 nxEncrypt(某数组)
 * 候选：明文basearr各段 / keys2 / keys17 / keys[i]
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

// 明文 basearr = b86[2:140]
// base[68:] 长度 = base.length - 68
console.log('=== 候选 huffman 编码长度 vs base[68:] 长度 ===');
for (const s of samples.slice(0, 3)) {
  const tailLen = s.base.length - 68;
  const plain = s.b86.slice(2, 140);
  const cands = {
    plain138: nxEncrypt(plain).length,
    plain100: nxEncrypt(plain.slice(0, 100)).length,
    plain90: nxEncrypt(plain.slice(0, 90)).length,
    keys2: nxEncrypt(s.keys2).length,
    plainTail100: nxEncrypt(plain.slice(38, 138)).length,
    plainMid100: nxEncrypt(plain.slice(20, 120)).length,
  };
  console.log(`nsd=${s.nsd}: base[68:]=${tailLen} 候选长度:`, JSON.stringify(cands));
}

// 检查 base[68:] 是否 = nxEncrypt(明文basearr[38:138]) 或类似
console.log('\n=== base[68:] vs nxEncrypt(明文basearr 各切片) 前缀匹配 ===');
for (const s of samples) {
  const plain = s.b86.slice(2, 140);
  const tail = s.base.slice(68);
  const slices = {
    full: plain,
    s38: plain.slice(38),
    s20: plain.slice(20),
    s0_100: plain.slice(0, 100),
    s30_130: plain.slice(30, 130),
  };
  const best = [];
  for (const [name, sl] of Object.entries(slices)) {
    const enc = nxEncrypt(sl);
    let m = 0;
    const n = Math.min(enc.length, tail.length);
    for (let i = 0; i < n; i++) { if (enc[i] === tail[i]) m++; else break; }
    best.push(`${name}=${m}`);
  }
  console.log(`nsd=${s.nsd}: ${best.join(' ')}`);
}
