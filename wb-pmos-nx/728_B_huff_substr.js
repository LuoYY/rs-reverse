/**
 * 728_B_huff_substr.js
 * 检查 base 中是否包含 nxEncrypt(cap) 或 nxEncrypt(明文basearr) 的子串
 * base 是 huffman 编码后的"环境数组"，可能包含 cap 的 huffman 编码
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

console.log('=== nxEncrypt(cap) 在 base 中搜索 ===');
for (const s of NORMAL) {
  const encCap = nxEncrypt(s.cap);
  const bStr = s.base.join(',');
  const eStr = encCap.join(',');
  console.log(`nsd=${s.nsd}: encCap=${encCap.length}B base=${s.base.length}B 完整出现: ${bStr.indexOf(eStr) !== -1}`);
  // 前 16 字节子串
  const head = encCap.slice(0, 16).join(',');
  console.log(`  encCap前16 在 base: ${bStr.indexOf(head)}`);
}

// 用明文 basearr = b86[2:2+len] 测试（pairs 数据）
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
console.log('\n=== nxEncrypt(b86数组区) 在 base 中搜索 ===');
for (const s of pairs.slice(0, 5)) {
  const arrLen = (s.b86[0] << 8) | s.b86[1];
  const plain = s.b86.slice(2, 2 + arrLen);
  const enc = nxEncrypt(plain);
  const bStr = s.base.join(',');
  const eStr = enc.join(',');
  console.log(`nsd=${s.nsd}: enc=${enc.length}B base=${s.base.length}B 完整出现: ${bStr.indexOf(eStr) !== -1}`);
  const head = enc.slice(0, 16).join(',');
  console.log(`  enc前16 在 base: ${bStr.indexOf(head)}`);
}
