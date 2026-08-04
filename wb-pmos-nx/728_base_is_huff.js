/**
 * 728_base_is_huff.js
 * 验证假设：base = nxEncrypt(明文basearr len=138)？
 * 用 triple 数据集的 cap（可能长度不对，需要重新捕获 len=138）
 * 先看现有 cap 各长度与 base 的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();

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

// 对每个 cap 长度，计算 nxEncrypt(cap[:L]) 看是否匹配 base 前缀
console.log('=== nxEncrypt(cap[:L]) vs base 前缀匹配 ===');
for (const s of samples) {
  const base = s.base;
  let best = { L: 0, match: 0 };
  for (let L = 100; L <= Math.min(220, s.cap.length); L += 2) {
    const enc = nxEncrypt(s.cap.slice(0, L));
    let m = 0;
    for (let i = 0; i < Math.min(enc.length, base.length); i++) {
      if (enc[i] === base[i]) m++; else break;
    }
    if (m > best.match) best = { L, match: m };
  }
  console.log(`nsd=${s.nsd}: capLen=${s.cap.length} 最优 nxEncrypt(cap[:${best.L}]) 前缀匹配=${best.match}/${base.length}`);
  if (best.match > 10) {
    const enc = nxEncrypt(s.cap.slice(0, best.L));
    console.log(`  enc[0:22]=${enc.slice(0, 22).join(',')}`);
    console.log(`  base[0:22]=${base.slice(0, 22).join(',')}`);
  }
}

// 检查 cap 是否为 base 的 huffman 解码？
console.log('\n=== cap 是否 = huffmanDecode(base)？ ===');
// 不，方向反了。base 是 cookie be 的解码，cap 是 CDP 捕获
// 检查 cap 与 base 长度关系：huffman 编码会让长度变大
// 但如果 cap 就是 huffman 编码的 base，cap 应该更长且值域广
// 但 cap 值域 ≤113 受限，说明 cap 不是 huffman 输出
// 可能 cap 本身就是"明文 basearr"，base = nxEncrypt(cap)？

// 关键测试：base 前 22 固定字节 vs nxEncrypt 的固定前缀
// nxEncrypt(相同前缀) 应该产生相同前缀
// 检查 cap 前 5 字节 [113, x, 32, 4, ...] 固定 → nxEncrypt 前缀应该固定
const caps = samples.map(s => s.cap.slice(0, 5));
console.log('\ncap 前 5 字节:', caps.map(c => c.join(',')).join(' | '));
