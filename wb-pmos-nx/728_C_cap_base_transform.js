/**
 * 728_C_cap_base_transform.js
 * 验证 team-lead 假设：
 * A. cap XOR base179 对齐位是否跨样本恒定（长度不同先对齐）
 * B. base[68:92] 敏感区是否 = cap 某段的内层加密
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

// 合并所有样本（pairs 有 b86 无 cap，triple 有 cap）
const samples = [];
for (const s of pairs) {
  samples.push({ nsd: s.nsd, base: s.base, cap: null, b86: s.b86, len: s.base.length });
}
for (const s of trip) {
  const b86 = decodeB86(s.cd);
  samples.push({ nsd: s.nsd, base: s.base, cap: s.cap, b86, len: s.base.length });
}
const capSamples = samples.filter(s => s.cap);
console.log('样本数:', samples.length, '含cap:', capSamples.length);

// ============ 假设 A: cap[i] ^ base[j] 跨样本恒定 ============
console.log('\n===== A: cap[i] ^ base[j] 跨样本恒定 (i<capLen, j<baseLen) =====');
const capMax = Math.min(...capSamples.map(s => s.cap.length));
const baseMax = Math.min(...samples.map(s => s.base.length));
const constPairs = [];
for (let i = 0; i < capMax; i++) {
  for (let j = 0; j < baseMax; j++) {
    const vals = new Set();
    for (const s of capSamples) {
      if (s.cap[i] === undefined || s.base[j] === undefined) { vals.add('X'); break; }
      vals.add((s.cap[i] ^ s.base[j]) & 255);
      if (vals.size > 1) break;
    }
    if (vals.size === 1 && !vals.has('X')) constPairs.push([i, j, [...vals][0]]);
  }
}
console.log('恒定 XOR 对 (cap_i ^ base_j = const):', constPairs.length);
console.log(constPairs.slice(0, 80).map(([i, j, v]) => `cap[${i}]^base[${j}]=${v}`).join('  '));

// 特写：base[68:92] 敏感区 vs cap 前段
console.log('\n===== 特写: base[68]^cap[i] 和 base[69]^cap[i] 跨样本恒定? =====');
const SENS = [68, 69, 71, 80, 83, 84, 85, 86, 87, 88, 89];
for (const bi of SENS) {
  const found = [];
  for (let i = 0; i < capMax; i++) {
    const vals = new Set();
    for (const s of capSamples) {
      if (s.cap[i] === undefined || s.base[bi] === undefined) { vals.add('X'); break; }
      vals.add((s.cap[i] ^ s.base[bi]) & 255);
      if (vals.size > 1) break;
    }
    if (vals.size === 1 && !vals.has('X')) found.push(`cap[${i}]=>${[...vals][0]}`);
  }
  if (found.length) console.log(`base[${bi}]: ${found.join('  ')}`);
}

// ============ 假设 B: base[68:92] = cap[某段] 内层加密 ============
console.log('\n===== B: base[68:92] vs cap 各段 XOR 跨样本恒定搜索 =====');
for (let capOff = 0; capOff < capMax - 24; capOff++) {
  let consistent = true;
  let pattern = null;
  for (const s of capSamples) {
    if (s.cap.length < capOff + 24 || s.base.length < 92) { consistent = false; break; }
    const x = [];
    for (let k = 0; k < 24; k++) x.push((s.base[68 + k] ^ s.cap[capOff + k]) & 255);
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ cap[${capOff}:${capOff+24}] ^ base[68:92] 恒定 = [${pattern.join(',')}]`);
}

// 尝试部分对齐：只看敏感字节是否 = cap 某段 XOR 恒定
console.log('\n===== B2: 敏感字节集合 vs cap 逐偏移恒定 XOR =====');
for (let capOff = 0; capOff < capMax; capOff++) {
  let consistent = true;
  let pattern = null;
  for (const s of capSamples) {
    const x = [];
    for (let k = 0; k < SENS.length; k++) {
      const bi = SENS[k];
      if (s.cap[capOff + k] === undefined || s.base[bi] === undefined) { consistent = false; break; }
      x.push((s.base[bi] ^ s.cap[capOff + k]) & 255);
    }
    if (!consistent) break;
    if (!pattern) pattern = x;
    else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
  }
  if (consistent) console.log(`★ cap[${capOff}]^敏感字节 恒定 = [${pattern.join(',')}]`);
}

// ============ 补充: 各样本 base/cap/b86 长度与敏感字节 ============
console.log('\n===== C 准备: 各样本 base/cap/b86 长度与敏感字节 =====');
for (const s of capSamples) {
  console.log(`nsd=${s.nsd}: base.len=${s.base.length} cap.len=${s.cap.length} b86.len=${s.b86.length} | base[68]=${s.base[68]} base[69]=${s.base[69]} cap[24]=${s.cap[24]} cap[25:30]=${s.cap.slice(25,30).join(',')}`);
}
