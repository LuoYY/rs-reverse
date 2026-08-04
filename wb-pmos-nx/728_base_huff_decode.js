/**
 * 728_base_huff_decode.js
 * 尝试对 base 做 huffman 解码！如果 base 本身是 huffman 编码的数据（值域0-255均匀），
 * 解码后可能得到可读的明文 basearr 或属性名列表
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

// 对 base 做 huffman 解码
console.log('=== base huffman 解码尝试 ===');
for (const s of samples) {
  const dec = huffmanDecodeRaw(s.base);
  const asStr = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
  console.log(`nsd=${s.nsd}: base len=${s.base.length} 解码len=${dec.length}`);
  console.log(`  解码前100: ${asStr.substring(0, 100)}`);
  // 统计可读字符比例
  const printable = dec.filter(v => v >= 32 && v < 127).length;
  console.log(`  可读比例: ${printable}/${dec.length}`);
}

// 对 base[26:56] 固定段做 huffman 解码
console.log('\n=== base[26:56] 固定段 huffman 解码 ===');
for (const s of samples) {
  const dec = huffmanDecodeRaw(s.base.slice(26, 56));
  const asStr = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
  console.log(`nsd=${s.nsd}: 解码: ${asStr}`);
}
