/**
 * 728_base_huff_cap.js
 * 验证：base = [固定头22] + huffman(cap明文basearr) + [尾]
 * 用 cap[0:138]（CDP 捕获的明文 basearr 带 marker）
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

console.log('=== huffman(cap[0:138]) vs base[22:] 匹配 ===');
for (const s of samples) {
  const cap138 = s.cap.slice(0, 138);
  const enc = nxEncrypt(cap138);
  const baseTail = s.base.slice(22);
  // 前缀匹配
  let m = 0;
  const n = Math.min(enc.length, baseTail.length);
  for (let i = 0; i < n; i++) { if (enc[i] === baseTail[i]) m++; else break; }
  console.log(`nsd=${s.nsd}: cap138=${cap138.length} huff len=${enc.length} baseTail len=${baseTail.length} 前缀匹配=${m}`);
  if (m > 5) {
    console.log(`  huff[0:22]=${enc.slice(0, 22).join(',')}`);
    console.log(`  tail[0:22]=${baseTail.slice(0, 22).join(',')}`);
  } else {
    console.log(`  huff[0:8]=${enc.slice(0, 8).join(',')}`);
    console.log(`  tail[0:8]=${baseTail.slice(0, 8).join(',')}`);
  }
}

// 也许 huffman 编码前还插入了其他数据？
// 或者 base[22:] 整体 = huffman(cap + 其他)？
// 测试：huffman(cap138) 与 base 任意位置匹配
console.log('\n=== huffman(cap138) 在 base 中搜索 ===');
for (const s of samples) {
  const enc = nxEncrypt(s.cap.slice(0, 138));
  const bStr = s.base.join(',');
  const eStr = enc.join(',');
  console.log(`nsd=${s.nsd}: ${bStr.indexOf(eStr) !== -1 ? '★★ 直接出现' : '未出现'}`);
  const head6 = enc.slice(0, 6).join(',');
  console.log(`  huff前6=[${head6}] 位置: ${bStr.indexOf(head6)}`);
}
