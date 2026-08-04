/**
 * 728_B_8bytes_math.js
 * 分析 base[68:92] 中绑定 cd 的 ~8B（[68:69]+[83:86]+[88:89]）与 keys2/b86 的数学关系
 * 数据：pairs（10 样本含 cd/base/keys2/b86）+ triple（8 样本含 cd/base/keys2）
 */
const fs = require('fs');
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

// 敏感位置：基于探测 [68,69,71,80,83,84,85,86,87,88,89] + [90,91](400)
const SENS = [68, 69, 71, 80, 83, 84, 85, 86, 87, 88, 89, 90, 91];

console.log('============================================');
console.log(' pairs 样本敏感位置值汇总');
console.log('============================================');
const sensVals = {};
for (const s of pairs) {
  const b = s.base;
  const sv = SENS.map(i => b[i]).join(',');
  console.log(`nsd=${s.nsd}: sens=[${sv}] 完整[68:92]=${b.slice(68, 92).join(',')}`);
  sensVals[s.nsd] = SENS.map(i => b[i]);
}

// 检查敏感位置是否与 base 长度相关
console.log('\n============================================');
console.log(' 敏感位置 vs base 长度');
console.log('============================================');
for (const s of pairs) {
  const b = s.base;
  console.log(`nsd=${s.nsd} len=${b.length}: [68]=${b[68]} [69]=${b[69]} [71]=${b[71]} [80]=${b[80]} [83]=${b[83]} [84]=${b[84]} [85]=${b[85]} [86]=${b[86]} [87]=${b[87]} [88]=${b[88]} [89]=${b[89]}`);
}

// keys2 关系
console.log('\n============================================');
console.log(' 敏感位置 XOR keys2 对应位');
console.log('============================================');
for (const s of pairs) {
  const b = s.base;
  const k2 = s.keys2;
  const x = SENS.map((i, j) => b[i] ^ (k2[i - 68] ?? 0));
  console.log(`nsd=${s.nsd}: sens^k2=${x.join(',')}`);
}

// b86 关系
console.log('\n============================================');
console.log(' 敏感位置 vs b86 各偏移（逐偏移搜索固定 XOR）');
console.log('============================================');
// 搜索: base[SENS] ^ b86[off+SENS] 是否跨样本恒定
for (let off = 0; off < 200; off++) {
  const patterns = new Set();
  for (const s of pairs) {
    const b86 = decodeB86(s.cd);
    if (b86.length < off + 92) { patterns.add('X'); continue; }
    const key = SENS.map(i => (s.base[i] ^ b86[off + i]) & 255).join(',');
    patterns.add(key);
  }
  if (patterns.size === 1) {
    console.log(`★ 偏移 ${off}: base[sens] ^ b86[${off}+sens] 跨样本恒定 = ${[...patterns][0]}`);
  }
}

// 尝试 base[68:92] 整体 = b86[off:off+24] XOR 常数
console.log('\n============================================');
console.log(' [68:92] 整体 = b86[off:off+24] XOR 常数?');
console.log('============================================');
for (let off = 0; off < 100; off++) {
  let consistent = true;
  let pattern = null;
  for (const s of pairs) {
    const b86 = decodeB86(s.cd);
    const b = s.base;
    const x = b.slice(68, 92).map((v, i) => v ^ b86[off + i]);
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ 偏移 ${off}: base[68:92] = b86[${off}:${off+24}] XOR 常数 [${pattern.join(',')}]`);
}
