/**
 * 728_B_base_whole_decode.js
 * 测试 base 整体是否是 huffman 编码（解码回明文）
 * 也测试 base 是否 = nxEncrypt(某数据) 的逆
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;
const NORMAL = samples.filter(s => s.base[26] === 233);

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

console.log('=== base 整体 huffman 解码 ===');
for (const s of NORMAL.slice(0, 2)) {
  const dec = huffmanDecodeRaw(s.base);
  const asStr = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
  console.log(`nsd=${s.nsd}: base=${s.base.length}B 解码=${dec.length}B`);
  console.log(`  [${asStr}]`);
  // 解码结果是否可读？
  const printable = dec.filter(v => v >= 32 && v < 127).length;
  console.log(`  可读: ${printable}/${dec.length}`);
}

// 重要：base 是 huffman 解码后的数据（从 be 段解码），
// 所以 base 是"明文"，但值域均匀 → base 本身是加密/编码数据
// base[0:22] 固定 = 加密的环境数据固定段
// 也许 base = [加密固定头] + [加密会话数据]

// 尝试：base[0:22] 与 base[29:68] 是否可解密为环境数据？
// base 值是"环境数组"的加密？用 keys2 或 keys17？

// 检查 base 中是否有 basearrFull（属性名列表）的加密
const fd = JSON.parse(fs.readFileSync('/tmp/nx_fixed_dataset.json', 'utf8'));
if (fd.basearrFull) {
  const bf = fd.basearrFull.map(c => c);
  console.log('\nbasearrFull:', bf.slice(0, 60).map(c => String.fromCharCode(c)).join(''));
  // 检查 bf 是否出现在 base 固定段解码中
  const s0 = NORMAL[0];
  const dec = huffmanDecodeRaw(s0.base);
  const dStr = dec.join(',');
  console.log('basearrFull 在 base 解码中:', dStr.indexOf(bf.join(',')));
}
