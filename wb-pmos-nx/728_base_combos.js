/**
 * 728_base_combos.js
 * 尝试 base = 各种组合的 huffman 编码
 * 关键线索：base[0:22] 固定 + [26:56] 固定 → base 大部分是"环境常量"
 * 也许 base = huffman([固定前缀] + [明文basearr] + [固定后缀])
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

const s0 = samples[0];
const FIX_HEAD = s0.base.slice(0, 22);  // 固定头
console.log('固定头:', FIX_HEAD.join(','));

// 尝试 base = huffman(cap) 与固定头的拼接组合
// base[0:22] = 固定头，base[22:] = huffman 编码的什么？
// 但 nxEncrypt 输出长度 135-138，base[22:] 长度 143-147

// 尝试：base = huffman(固定头拼接 + cap + 固定尾拼接)？
// 先验证：base 是否是 huffman(某数据) 的产物 → base 值域 0-255 均匀 = huffman 输出特征
// 如果 base 是 huffman 输出，那 huffmanDecode(base) 应该得到可读数据？
// 之前测试 huffmanDecode(base) 可读比例低

// 也许 base 根本不是 huffman 编码！而是原始字节（环境数据 + 会话数据）
// base[0:22] 固定 = 环境数据固定段
// base 变化段 = 会话相关数据（可能 = keys2 或明文basearr 的编码）

// 检查 base 变化段（68-116）与 keys2 的 Pearson 相关性
console.log('\n=== base 变化段与 keys2 相关 ===');
for (const s of samples) {
  const seg = s.base.slice(68, 116);
  const k2 = s.keys2;
  // 计算 base[68:116] XOR keys2 是否有固定模式
  // 直接看 base[68:116] 是否 = keys2 的某段 XOR 常数
}

// 换个思路：base 变化段是否 = huffman(明文 basearr marker 段)？
// 明文 basearr marker = 24+16k 位置（8 个值）
// 打印 cap 的 marker 与 base 变化段

console.log('\n=== cap markers vs base 变化段 ===');
for (const s of samples) {
  const mk = [24, 40, 56, 72, 88, 104, 120, 136].map(p => s.cap[p]);
  console.log(`nsd=${s.nsd}: capMk=[${mk.join(',')}] base[68:116]前半=${s.base.slice(68, 92).join(',')}`);
}

// 关键测试：base 是否 = [固定头] + huffman(keys2) + [固定尾]？
console.log('\n=== huffman(keys2) vs base[22:72] ===');
for (const s of samples) {
  const hk = nxEncrypt(s.keys2);
  const seg = s.base.slice(22, 22 + hk.length);
  let same = 0;
  for (let i = 0; i < hk.length; i++) if (hk[i] === seg[i]) same++;
  console.log(`nsd=${s.nsd}: huff(keys2)=${hk.length}B 与 base[22:22+len] 相同=${same}/${hk.length}`);
}
