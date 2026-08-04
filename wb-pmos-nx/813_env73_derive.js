/**
 * 813_env73_derive.js 分析 [68:73] 与 cd/cap 的关系（模板库可行性）
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
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, cd: s.cd, cap: s.cap, base: s.base179, keys2: s.keys2, b86: decodeB86(s.cd) });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, cd: s.cd, cap: s.cap, base: s.base, keys2: s.keys2, b86: decodeB86(s.cd) });

console.log('=== [68:73] vs cd/cap 特征 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: env73=[${s.base.slice(68,73).join(',')}] cap.len=${s.cap.length} cd.len=${s.cd.length} cap[1]=${s.cap[1]} cap[4]=${s.cap[4]} b86[1]=${s.b86[1]} b86.len=${s.b86.length}`);
}

// [68:73] XOR cap 各偏移恒定?
console.log('\n=== [68:73] XOR cap 各偏移恒定? ===');
const capMax = Math.min(...samples.map(s => s.cap.length));
for (let off = 0; off < capMax - 5; off++) {
  let consistent = true;
  let pattern = null;
  for (const s of samples) {
    const x = [];
    for (let k = 0; k < 5; k++) x.push((s.base[68 + k] ^ s.cap[off + k]) & 255);
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ cap[${off}] ^ env73 恒定 = [${pattern.join(',')}]`);
}

// [68:73] XOR b86
console.log('\n=== [68:73] XOR b86 各偏移恒定? ===');
for (let off = 0; off < 300; off++) {
  let consistent = true;
  let pattern = null;
  for (const s of samples) {
    if (s.b86.length < off + 5) { consistent = false; break; }
    const x = [];
    for (let k = 0; k < 5; k++) x.push((s.base[68 + k] ^ s.b86[off + k]) & 255);
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ b86[${off}] ^ env73 恒定 = [${pattern.join(',')}]`);
}

// 尝试 hash: env73[0] 与 cap 求和/长度
console.log('\n=== env73 与 cap 统计特征 ===');
for (const s of samples) {
  const capSum = s.cap.reduce((a, v) => a + v, 0);
  const capSum8 = capSum & 255;
  console.log(`nsd=${s.nsd}: env73[0]=${s.base[68]} capSum8=${capSum8} capLen8=${s.cap.length & 255} cdLen8=${s.cd.length & 255}`);
}

// 尝试: env73 是否 = cap[24]（环境标记）相关
console.log('\n=== env73 vs cap[24] ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: env73=[${s.base.slice(68,73).join(',')}] cap[24]=${s.cap[24]} cap[25:30]=[${s.cap.slice(25,30).join(',')}]`);
}
