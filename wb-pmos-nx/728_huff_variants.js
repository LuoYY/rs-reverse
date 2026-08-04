/**
 * 728_huff_variants.js
 * 尝试 huffman 编码变体：bit 顺序、前缀/后缀、长度偏移
 * 目标：找到 base[22:] == 某种(明文basearr)
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
const huffEncCfg = getEncCfg(getTree());

// 变体1：标准 nxEncrypt
function nxEncrypt(numarr) {
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
// 变体2：bit 反转每字节
function nxEncryptBitRev(numarr) {
  const enc = nxEncrypt(numarr);
  return enc.map(b => {
    let r = 0;
    for (let i = 0; i < 8; i++) r = (r << 1) | ((b >> i) & 1);
    return r;
  });
}
// 变体3：LSB-first 编码（每次移低 bit）
function nxEncryptLSB(numarr) {
  const ans = [];
  let one = 0, two = 0;
  for (let i = 0; i < numarr.length; i++) {
    const cfg = huffEncCfg[numarr[i]];
    one = one | (cfg.key << two);
    two += cfg.val;
    while (two >= 8) { ans.push(one & 255); one >>= 8; two -= 8; }
  }
  if (two > 0) ans.push(one | (0x68 << two));
  return ans;
}

console.log('=== 变体测试：huff(cap138) vs base[22:] ===');
for (const s of samples) {
  const cap138 = s.cap.slice(0, 138);
  const baseTail = s.base.slice(22);
  const variants = {
    std: nxEncrypt(cap138),
    bitRev: nxEncryptBitRev(cap138),
    lsb: nxEncryptLSB(cap138),
  };
  const out = [];
  for (const [name, enc] of Object.entries(variants)) {
    let m = 0;
    const n = Math.min(enc.length, baseTail.length);
    for (let i = 0; i < n; i++) { if (enc[i] === baseTail[i]) m++; else break; }
    out.push(`${name}=${m}`);
  }
  console.log(`nsd=${s.nsd}: ${out.join(' ')}`);
}

// 检查 base[22:] 是否 = 明文 basearr 直接（无 huffman）
console.log('\n=== base[22:] vs cap 直接 ===');
for (const s of samples) {
  const baseTail = s.base.slice(22);
  let m = 0;
  const n = Math.min(baseTail.length, s.cap.length);
  for (let i = 0; i < n; i++) { if (baseTail[i] === s.cap[i]) m++; else break; }
  console.log(`nsd=${s.nsd}: 直接匹配=${m}`);
}

// base[22:] vs b86 其他偏移
console.log('\n=== base[22:] vs b86[off:] 最大匹配偏移 ===');
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
for (const s of samples) {
  const b86 = decodeB86(s.cd);
  if (!b86) continue;
  const baseTail = s.base.slice(22);
  let bestOff = -1, bestM = 0;
  for (let off = 0; off < Math.min(b86.length - 140, 50); off++) {
    let m = 0;
    const n = Math.min(baseTail.length, b86.length - off);
    for (let i = 0; i < n; i++) { if (baseTail[i] === b86[off + i]) m++; else break; }
    if (m > bestM) { bestM = m; bestOff = off; }
  }
  console.log(`nsd=${s.nsd}: 最优偏移=${bestOff} 匹配=${bestM}`);
}
