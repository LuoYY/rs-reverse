/**
 * 768_huff_cap_compare.js
 * 终极假设：base = huffman(cap) 或 cap 的某种编码 + 固定头
 * 1. nxEncrypt(cap) vs base[22:] 长度对比
 * 2. base 解码（huffmanDecode）后是否 = cap
 * 3. 尝试 base[22:] 直接 huffman 解码
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const d = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const S = d.samples.filter(s => s.base[26] === 233);

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
function huffmanDecodeRaw(enc) {
  const encCfg = getEncCfg(getTree());
  const byLenMap = {}; let maxL = 0;
  for (let idx = 0; idx < 256; idx++) {
    const c = encCfg[idx];
    if (!c) continue;
    if (!byLenMap[c.val]) byLenMap[c.val] = {};
    byLenMap[c.val][c.key] = idx;
    if (c.val > maxL) maxL = c.val;
  }
  const ans = [];
  let key = 0, val = 0;
  for (let i = 0; i < enc.length; i++) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((enc[i] >> b) & 1);
      val++;
      const mm = byLenMap[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
  return ans;
}

(async () => {
  console.log('=== 假设测试：base = huffman(cap)? ===');
  S.forEach(s => {
    const cap = s.cap;
    const base = s.base;
    const huffCap = nxEncrypt(cap);
    console.log('nsd=' + s.nsd + ' cap_len=' + cap.length + ' huff(cap)=' + huffCap.length + ' base_len=' + base.length);
  });
  console.log();

  // 假设2：base[22:] 是 cap 的编码，编码方式待定
  // 尝试把 cap 用 huffman 编码，然后 base[22:] 解码
  console.log('=== base[22:] 直接 huffman 解码测试 ===');
  const s0 = S[0];
  const base22 = s0.base.slice(22);
  const dec = huffmanDecodeRaw(base22);
  console.log('nsd=' + s0.nsd + ' base[22:]len=' + base22.length + ' huff解码后=' + dec.length);
  console.log('解码前20:', dec.slice(0, 20).join(','));
  console.log('cap 前20:', s0.cap.slice(0, 20).join(','));
  console.log();

  // 假设3：base = [固定头] + huffman编码(cap)，编码后拼固定段
  // 检查 base[22:] 是否是有效 huffman 流（用 huffman 解码验证）
  console.log('=== base[22:] 前缀 vs huff(cap) 前缀 ===');
  const huff0 = nxEncrypt(s0.cap);
  console.log('huff(cap) 前40:', huff0.slice(0, 40).join(','));
  console.log('base[22:62]:', base22.slice(0, 40).join(','));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
