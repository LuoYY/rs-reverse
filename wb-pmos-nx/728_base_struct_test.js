/**
 * 728_base_struct_test.js
 * 测试 base 结构：base = [固定头22] + X + [固定尾]
 * X 是否是 huffman(明文basearr) 或 huffman(明文basearr+其他)
 * 同时测试：cap(明文basearr) 的 huffman 编码是否 == be 段原始（未解码）？
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

// 检查：cap(明文basearr) 经过 huffman 编码 == be 段（可能还差 XOR/加密）
console.log('=== cap huffman 编码 vs be ===');
for (const s of samples) {
  const encCap = nxEncrypt(s.cap.slice(0, 138));
  const be = s.be;
  const n = Math.min(encCap.length, be.length);
  let same = 0;
  const diffs = [];
  for (let i = 0; i < n; i++) {
    if (encCap[i] === be[i]) same++; else diffs.push(i);
  }
  console.log(`nsd=${s.nsd}: nxEncrypt(cap138) len=${encCap.length} be len=${be.length} 相同=${same}/${n}`);
  if (diffs.length < 12) console.log(`  差异位置: ${diffs.join(',')}`);
}

// 检查 cap huffman vs huff（be 解密后），但 huff 需要 keys17
// 先跳过，直接用 base 和 cap 的关系
// base = huffmanDecode(huff)，huff = nxEncrypt(base)（已验证）
// 所以问题是：base 的内容是什么？为什么前 22 固定？

// 关键测试：base[22:len-8]（变化段）是否 = nxEncrypt(明文 basearr)？
console.log('\n=== base[22:len-8] vs nxEncrypt(cap138) 匹配 ===');
for (const s of samples) {
  const enc = nxEncrypt(s.cap.slice(0, 138));
  const mid = s.base.slice(22, s.base.length - 8);
  const n = Math.min(enc.length, mid.length);
  let same = 0;
  const diffs = [];
  for (let i = 0; i < n; i++) {
    if (enc[i] === mid[i]) same++; else diffs.push(i);
  }
  console.log(`nsd=${s.nsd}: mid len=${mid.length} enc len=${enc.length} 相同=${same}/${n} 前10差异=${diffs.slice(0, 10).join(',')}`);
}
