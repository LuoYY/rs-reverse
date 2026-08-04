/**
 * 728_combo_test.js
 * 尝试各种拼接：base = huffman(固定头 + 明文basearr + 固定尾)
 * 以及 base 是否是 huffman(某种组合)
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

// base 固定头
const s0 = samples[0];
console.log('base[0:22]:', s0.base.slice(0, 22).join(','));
console.log('base 长度:', s0.base.length);

// 尝试：base = huffman(cap138) 后加固定头？
// 或者 base = [固定头] + huffman(cap) + [固定尾]
// 观察 base 固定头 22B = 179,0,127,... 这个值是否在 huffman 编码空间？

// 重要：检查 cap(明文basearr) 是否 = huffman(base) 的解码？
// 即 base 是编码，cap 是明文？但 base 值域均匀更可能是编码结果
// 让我测试：huffmanDecode(base) 是否 == cap？

// 更直接：nxEncrypt(cap138) 是否出现在 base 中（作为子串，考虑偏移）
console.log('\n=== nxEncrypt(cap138) 在 base 各偏移匹配 ===');
for (const s of samples) {
  const enc = nxEncrypt(s.cap.slice(0, 138));
  const base = s.base;
  let bestOff = -1, bestM = 0;
  for (let off = 0; off <= base.length - 20; off++) {
    let m = 0;
    const n = Math.min(enc.length, base.length - off);
    for (let i = 0; i < n; i++) { if (enc[i] === base[off + i]) m++; else break; }
    if (m > bestM) { bestM = m; bestOff = off; }
  }
  console.log(`nsd=${s.nsd}: 最优偏移=${bestOff} 连续匹配=${bestM}`);
}

// 测试：base[22:] 是否是 huffman 编码数据（值域均匀 → 可能）
// 测试：base 是否由多个 huffman 编码段拼接（分段后各自解码）
// 观察 base[22:26] 与 base[26:56] 之间是否有"长度分隔符"
console.log('\n=== base 分段探索（26-56 固定段特征） ===');
console.log('base[22:26] (变化):', s0.base.slice(22, 26).join(','));
console.log('base[26:56] (固定):', s0.base.slice(26, 56).join(','));
console.log('base[56:68]:', s0.base.slice(56, 68).join(','));
console.log('base[68:116] (变化):', s0.base.slice(68, 116).join(','));
console.log('base[116:138]:', s0.base.slice(116, 138).join(','));
console.log('base[138:]:', s0.base.slice(138).join(','));
