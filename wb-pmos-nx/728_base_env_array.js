/**
 * 728_base_env_array.js
 * 假设：base 是"环境数组"编码（大部分固定），变化段来自 cd
 * 验证：base 变化段是否 = 明文 basearr markers 的函数
 * 以及 base 是否 = nxEncrypt(环境数组) 其中环境数组 = [固定] + [keys2/会话]
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

// 打印每个会话 base 的变化位置值
console.log('=== base 变化位置值（位置: 各会话值） ===');
const maxLen = Math.max(...samples.map(s => s.base.length));
for (let i = 22; i < maxLen; i++) {
  const vals = samples.map(s => s.base[i]);
  const uniq = new Set(vals);
  if (uniq.size > 1) {
    console.log(`[${i}] ${vals.join(',')}`);
  }
}

// 分析：base[22:26]（4字节）与 base[68:116]（48字节）是否来自 cap 的 marker
// cap markers = 24+16k 位置
console.log('\n=== base[68:116] 是否 = nxEncrypt(cap markers 或某段) ===');
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

// base[22:26] 4 字节：尝试 = 某个 huffman 编码的短数据
// base[68:116] 48 字节：尝试 = nxEncrypt(keys2) 或 nxEncrypt(cap markers)

for (const s of samples) {
  const seg = s.base.slice(68, 116);
  const k2 = s.keys2;
  // nxEncrypt(keys2) 长度 50，base[68:116] 长度 48
  // 尝试：base[68:116] 是否 = nxEncrypt(keys2)[0:48]？
  const hk = nxEncrypt(k2);
  let same = 0;
  for (let i = 0; i < 48; i++) if (hk[i] === seg[i]) same++;
  console.log(`nsd=${s.nsd}: nxEncrypt(keys2)[0:48] vs base[68:116] 相同=${same}/48`);
}
