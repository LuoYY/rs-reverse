/**
 * 728_base_huff_test.js
 * 核心验证：base = nxEncrypt(b86[2:140]) ?
 * b86[2:140] = 明文 basearr（138 字节，113 开头）
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decodeB86(str) {
  const idxmap = {};
  for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = [];
  let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

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

console.log('=== base vs nxEncrypt(b86[2:140]) ===');
for (const s of samples) {
  const b86 = decodeB86(s.cd);
  if (!b86) continue;
  const plain = b86.slice(2, 140);  // 明文 basearr 138B
  const enc = nxEncrypt(plain);
  const base = s.base;
  let m = 0;
  const n = Math.min(enc.length, base.length);
  for (let i = 0; i < n; i++) { if (enc[i] === base[i]) m++; else break; }
  console.log(`nsd=${s.nsd}: plain=${plain.length} enc=${enc.length} base=${base.length} 前缀匹配=${m}`);
  if (m > 5) {
    console.log(`  enc[0:22]=${enc.slice(0, 22).join(',')}`);
    console.log(`  base[0:22]=${base.slice(0, 22).join(',')}`);
  } else {
    console.log(`  enc[0:8]=${enc.slice(0, 8).join(',')}`);
    console.log(`  base[0:8]=${base.slice(0, 8).join(',')}`);
  }
}

// 也许 base 包含其他前缀？测试 nxEncrypt(plain) 是否等于 base 尾部
console.log('\n=== nxEncrypt(b86[2:140]) 在 base 中搜索 ===');
for (const s of samples) {
  const b86 = decodeB86(s.cd);
  if (!b86) continue;
  const plain = b86.slice(2, 140);
  const enc = nxEncrypt(plain);
  const bStr = s.base.join(',');
  const eStr = enc.join(',');
  console.log(`nsd=${s.nsd}: ${bStr.indexOf(eStr) !== -1 ? '★★ 直接出现' : '未出现'}`);
  // 部分前缀匹配
  const head8 = enc.slice(0, 8).join(',');
  console.log(`  enc前8=[${head8}] 出现位置: ${bStr.indexOf(head8)}`);
}
