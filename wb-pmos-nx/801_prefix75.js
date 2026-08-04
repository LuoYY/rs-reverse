/**
 * 801_prefix75.js 分析 [68:75] 7字节（cd确定性）与 cap/cd 的关系
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
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

const samples = [];
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, base: s.base179, cap: s.cap, keys2: s.keys2, b86: decodeB86(s.cd) });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, base: s.base, cap: s.cap, keys2: s.keys2, b86: decodeB86(s.cd) });

console.log('=== [68:75] + 相关特征 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: [68:75]=${s.base.slice(68,75).join(',')} cap.len=${s.cap.length} cap[1]=${s.cap[1]} cap[4]=${s.cap[4]} b86[1]=${s.b86[1]}`);
}

// [68:75] XOR cap 各偏移恒定搜索
console.log('\n=== [68:75] XOR cap 各偏移恒定? ===');
const capMax = Math.min(...samples.map(s => s.cap.length));
for (let off = 0; off < capMax - 7; off++) {
  let consistent = true;
  let pattern = null;
  for (const s of samples) {
    const x = [];
    for (let k = 0; k < 7; k++) x.push((s.base[68 + k] ^ s.cap[off + k]) & 255);
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ cap[${off}] ^ [68:75] 恒定 = [${pattern.join(',')}]`);
}

// [68:75] XOR b86 各偏移
console.log('\n=== [68:75] XOR b86 各偏移恒定? ===');
for (let off = 0; off < 300; off++) {
  let consistent = true;
  let pattern = null;
  for (const s of samples) {
    if (s.b86.length < off + 7) { consistent = false; break; }
    const x = [];
    for (let k = 0; k < 7; k++) x.push((s.base[68 + k] ^ s.b86[off + k]) & 255);
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ b86[${off}] ^ [68:75] 恒定 = [${pattern.join(',')}]`);
}

// [68:75] XOR keys2
console.log('\n=== [68:75] XOR keys2 各偏移恒定? ===');
for (let off = 0; off < 200; off++) {
  let consistent = true;
  let pattern = null;
  for (const s of samples) {
    if (s.keys2.length < off + 7) { consistent = false; break; }
    const x = [];
    for (let k = 0; k < 7; k++) x.push((s.base[68 + k] ^ s.keys2[off + k]) & 255);
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ keys2[${off}] ^ [68:75] 恒定 = [${pattern.join(',')}]`);
}

// [68:75] 与 base 长度/会话段关系
console.log('\n=== [68:75] vs base 长度/会话段 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: len=${s.base.length} [68:75]=${s.base.slice(68,75).join(',')} sess[22:29]=${s.base.slice(22,29).join(',')}`);
}
