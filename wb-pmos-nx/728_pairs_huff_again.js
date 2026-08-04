/**
 * 728_pairs_huff_again.js
 * 假设：base 本身可能是"编码"数据（值域均匀 0-255）
 * 1. huffmanDecode(base) → 得到什么？
 * 2. base[68:] 是否 = nxEncrypt(明文 basearr 某段)？
 * 3. base 长度 165-171 与明文 basearr 138 的关系
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

console.log('=== huffmanDecode(base) ===');
for (const s of samples) {
  const dec = huffmanDecodeRaw(s.base);
  const asStr = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
  console.log(`nsd=${s.nsd}: base=${s.base.length} 解码=${dec.length} [${asStr.substring(0, 80)}]`);
}

// huffmanDecode(base[68:])
console.log('\n=== huffmanDecode(base[68:]) ===');
for (const s of samples) {
  const dec = huffmanDecodeRaw(s.base.slice(68));
  const asStr = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
  console.log(`nsd=${s.nsd}: base[68:]=${s.base.length - 68} 解码=${dec.length} [${asStr.substring(0, 80)}]`);
}
