/**
 * 728_B_tail_b86decode.js
 * base[68:] 可能是 numarr 编码数据（b86 或 huffman 二次编码）
 * base[68:] 值域 0-255 均匀
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;
const NORMAL = samples.filter(s => s.base[26] === 233);

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

// base[68:] 是否可解释为 b86 字符序列（每个字节映射 NX_BS 索引）
for (const s of NORMAL.slice(0, 3)) {
  const tail = s.base.slice(68);
  // 检查每个字节是否都在 NX_BS 索引范围内 (0-85)
  const inRange = tail.filter(v => v >= 0 && v < NX_BS.length).length;
  console.log(`nsd=${s.nsd}: base[68:] ${tail.length}B 在NX_BS范围(0-${NX_BS.length - 1})内: ${inRange}/${tail.length}`);
}

// 检查 base[68:] 的 huffman 二次解码（用同一树）
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
console.log('\n=== base[68:] 二次 huffman 解码 ===');
for (const s of NORMAL.slice(0, 3)) {
  const dec = huffmanDecodeRaw(s.base.slice(68));
  console.log(`nsd=${s.nsd}: 解码=${dec.length}B: ${dec.slice(0, 50).join(',')}`);
}
