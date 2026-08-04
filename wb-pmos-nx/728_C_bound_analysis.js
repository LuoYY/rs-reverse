/**
 * 728_C_bound_analysis.js
 * 分析真绑定位置 [68]+[83:88]（7字节）与 cd/cap/b86/keys2 的关系
 * 26 样本（8 实时 + 10 pairs + 8 triple）
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

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

const BOUND = [68, 83, 84, 85, 86, 87, 88];
const samples = [];
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, base: s.base179, cap: s.cap, b86: decodeB86(s.cd), keys2: s.keys2 });
for (const s of pairs) samples.push({ src: 'pairs', nsd: s.nsd, base: s.base, cap: null, b86: s.b86, keys2: s.keys2 });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, base: s.base, cap: s.cap, b86: decodeB86(s.cd), keys2: s.keys2 });

console.log('样本数:', samples.length);
console.log('\n=== 真绑定位置 [68]+[83:88] 跨样本值 ===');
for (const s of samples) {
  const b = s.base;
  console.log(`[${s.src} ${s.nsd}] len=${b.length}: [68]=${b[68]} [83:89]=${b.slice(83,89).join(',')} [89:92]=${b.slice(89,92).join(',')}`);
}

// 与 base 长度 / 会话段的关系
console.log('\n=== [68] vs base 长度 / 会话段 ===');
for (const s of samples) {
  const b = s.base;
  console.log(`nsd=${s.nsd} len=${b.length}: b68=${b[68]} b83-88=[${b.slice(83,89).join(',')}] sess[22:29]=[${b.slice(22,29).join(',')}]`);
}

// 检查 [68]+[83:88] 是否 = b86 某偏移切片的 XOR/常数
console.log('\n=== 搜索: base[68]+base[83:88] XOR b86 各偏移 恒定? ===');
const SEG = [68, 83, 84, 85, 86, 87, 88];
for (let off = 0; off < 500; off++) {
  let consistent = true;
  let pattern = null;
  for (const s of samples) {
    if (!s.b86 || s.b86.length < off + 7 || s.base.length < 89) { consistent = false; break; }
    const x = [];
    for (let k = 0; k < 7; k++) x.push((s.base[SEG[k]] ^ s.b86[off + k]) & 255);
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ b86[${off}] ^ 绑定段 恒定 = [${pattern.join(',')}]`);
}

// 搜索 keys2
console.log('\n=== 搜索: base[68]+base[83:88] XOR keys2 各偏移 恒定? ===');
for (let off = 0; off < 200; off++) {
  let consistent = true;
  let pattern = null;
  for (const s of samples) {
    if (!s.keys2 || s.keys2.length < off + 7 || s.base.length < 89) { consistent = false; break; }
    const x = [];
    for (let k = 0; k < 7; k++) x.push((s.base[SEG[k]] ^ s.keys2[off + k]) & 255);
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ keys2[${off}] ^ 绑定段 恒定 = [${pattern.join(',')}]`);
}

// 搜索 cap（仅含 cap 的样本）
const capSamples = samples.filter(s => s.cap);
console.log('\n=== 搜索: 绑定段 XOR cap 各偏移 恒定? (含cap样本数: ' + capSamples.length + ') ===');
for (let off = 0; off < 300; off++) {
  let consistent = true;
  let pattern = null;
  for (const s of capSamples) {
    if (s.cap.length < off + 7 || s.base.length < 89) { consistent = false; break; }
    const x = [];
    for (let k = 0; k < 7; k++) x.push((s.base[SEG[k]] ^ s.cap[off + k]) & 255);
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ cap[${off}] ^ 绑定段 恒定 = [${pattern.join(',')}]`);
}

// 每位置独立恒定搜索（允许不同偏移）
console.log('\n=== 每绑定字节独立 XOR 搜索 ===');
for (let si = 0; si < SEG.length; si++) {
  const bi = SEG[si];
  for (let off = 0; off < 400; off++) {
    let consistent = true;
    let v = null;
    for (const s of samples) {
      if (!s.b86 || s.b86.length < off + 1 || s.base.length <= bi) { consistent = false; break; }
      const x = (s.base[bi] ^ s.b86[off]) & 255;
      if (v === null) v = x;
      else if (v !== x) { consistent = false; break; }
    }
    if (consistent) console.log(`★ base[${bi}] ^ b86[${off}] = ${v} 恒定（${samples.length}样本）`);
  }
}

// base 长度关系：绑定段是否与 len 的某函数
console.log('\n=== 绑定段 vs base 长度编码分析 ===');
for (const s of samples) {
  const b = s.base;
  const seg = b[68] ^ (b[83] & 255);
  console.log(`nsd=${s.nsd} len=${b.length}: b68^b83=${seg} b84=${b[84]} b87=${b[87]}`);
}
