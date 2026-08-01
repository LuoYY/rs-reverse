/**
 * 86_analyze_cd_keys.js
 *
 * 分析 (cd, keys2) 多会话数据，找 keys2 派生规律
 * keys2 = genKeys(cdArr XOR offset)，对比 cdArr 与 keys2
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeStr(s) {
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(s.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]], c3 = idxmap[s[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < s.length) { const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]]; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  else if (qi + 1 < s.length) bytes.push((idxmap[s[qi]] << 2) | (idxmap[s[qi + 1]] >> 4));
  return bytes;
}

const f = fs.readdirSync(OUT).filter(x => x.startsWith('multi_cd_keys_')).sort().pop();
const sessions = JSON.parse(fs.readFileSync(path.join(OUT, f)));
console.log('会话数:', sessions.length, '\n');

// 1. cd 解码 + keys2 结构
const decoded = [];
for (const s of sessions) {
  const cdArr = decodeStr(s.cd);
  decoded.push({ ...s, cdArr });
  console.log(`nsd=${s.nsd} cdLen=${s.cd.length} cdArrLen=${cdArr.length} keys2前8=${s.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
}

// 2. keys2 跨会话恒定段（可能含环境/常量）
if (decoded.length >= 2) {
  const k0 = decoded[0].keys2;
  const samePos = [];
  for (let i = 0; i < 48; i++) {
    if (decoded.every(d => d.keys2[i] === k0[i])) samePos.push(i);
  }
  console.log('\nkeys2 跨会话恒定段:', samePos.length ? samePos.join(',') : '无');
}

// 3. cdArr 尾部与 keys2 的关系（genKeys 用 cdArr 尾部 XOR offset）
console.log('\n=== cdArr 尾部 vs keys2 前段 ===');
for (const d of decoded) {
  const cd = d.cdArr;
  // keys2 与 cdArr 各位置的 XOR 相似度
  let best = 0, bestOff = -1;
  for (let off = 0; off + 8 <= cd.length; off++) {
    let s = 0;
    for (let i = 0; i < 8; i++) if (cd[off + i] === d.keys2[i]) s++;
    if (s > best) { best = s; bestOff = off; }
  }
  console.log(`nsd=${d.nsd}: keys2[0:8] 与 cdArr 最佳命中 ${best}/8 @偏移${bestOff}`);
}

// 4. keys16 XOR keys2 前 16
console.log('\n=== keys16 XOR keys2 ===');
for (const d of decoded) {
  const xor = d.keys2.slice(0, 16).map((b, i) => b ^ d.keys16[i]);
  console.log(`nsd=${d.nsd}: keys16^keys2[0:16] = ${xor.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
}

// 5. keys17 XOR keys2（如果 keys17 有）
console.log('\n=== keys17 XOR keys2 ===');
for (const d of decoded) {
  if (d.keys17) {
    const xor = d.keys2.slice(0, 16).map((b, i) => b ^ d.keys17[i]);
    console.log(`nsd=${d.nsd}: keys17^keys2[0:16] = ${xor.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  }
}
