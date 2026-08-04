/**
 * 728_base_verify_full.js
 * 1. 检查 94192/109585 是否多字节会话
 * 2. 用完整链路验证 base 解码：nxEncrypt(base) == be解密后 ^ keys2
 * 3. 对比 base 与 cap 关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

// cap 是否含 >=128（多字节）
console.log('=== cap >=128 检查 ===');
for (const s of samples) {
  const ge = s.cap.filter(v => v >= 128).length;
  console.log(`nsd=${s.nsd}: cap>=128 数=${ge}`);
}

// base 固定段检查（用 6 个"正常"会话）
const NORMAL = samples.filter(s => ![94192, 109585].includes(s.nsd));
console.log('\n=== 6 正常会话 base 分段 ===');
for (const s of NORMAL) {
  console.log(`nsd=${s.nsd}: [0:22]=${s.base.slice(0, 22).join(',')}`);
  console.log(`  [22:26]=${s.base.slice(22, 26).join(',')} [26:56]=${s.base.slice(26, 56).join(',')}`);
}

// 检查 base 是否 = nxEncrypt 的输入（也就是 base 是"明文"）
// 但 base 值域 0-255 均匀 → 可能 base 本身是"加密/编码"后的数据
// 检查 base 是否能被 nxEncrypt 后 == huff（需要 keys17）
// 直接从 be + keys2 重建 huff 需要 keys17。用 keys2 不足以。但可以验证 nxEncrypt(base) 长度

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

// 验证 nxEncrypt(base) 与 be 的关系（无需 keys17，直接看 be 和 huff 的差异特征）
console.log('\n=== nxEncrypt(base) vs be ===');
for (const s of samples) {
  const enc = nxEncrypt(s.base);
  const be = s.be;
  console.log(`nsd=${s.nsd}: nxEncrypt(base)=${enc.length}B be=${be.length}B 前缀匹配=${enc.slice(0, 16).join(',') === be.slice(0, 16).join(',')}`);
}
