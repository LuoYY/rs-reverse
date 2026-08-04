/**
 * 728_B_markers_deep.js
 * 分析 cap（明文 basearr）的标记位 [24+16k] 与 cd/b86 的关系
 * cap = b86[2:2+len]，标记位需替换 → 标记位是什么？
 * 假设 a) 环境检测（跨会话稳定） b) cd 函数（随 cd 变）
 */
const fs = require('fs');
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
  if (rem === 2) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]];
    if (c0 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4));
  } else if (rem === 3) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]];
    if (c0 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
  }
  return bytes;
}

console.log('=========== 标记位 (24+16k) 分析 ===========');
const marks = [24, 40, 56, 72, 88, 104, 120, 136];
for (const s of trip) {
  const b86 = decodeB86(s.cd);
  const cap = s.cap;
  const mkVals = marks.map(m => cap[m] !== undefined ? cap[m] : 'X');
  const b86Vals = marks.map(m => b86[m + 2] !== undefined ? b86[m + 2] : 'X');
  const diff = marks.map((m, i) => cap[m] !== undefined && b86[m + 2] !== undefined && cap[m] !== b86[m + 2]);
  console.log(`nsd=${s.nsd}: cap标记=[${mkVals.join(',')}] b86=[${b86Vals.join(',')}] 不同位=${diff.map((d, i) => d ? marks[i] : '').filter(x => x).join(',')}`);
}

// 分析标记位是否跨会话稳定（环境检测特征）
console.log('\n=========== 标记位跨会话稳定性（环境 vs cd） ===========');
for (let mi = 0; mi < marks.length; mi++) {
  const m = marks[mi];
  const vals = trip.map(s => s.cap[m]).filter(v => v !== undefined);
  const uniq = [...new Set(vals)];
  console.log(`标记位 [${m}]: 值=${vals.join(',')} unique=${uniq.length} ${uniq.length <= 2 ? '★ 跨会话稳定/少变' : '(随会话变)'}`);
}

// 标记位 vs b86 对应位的关系（差值/异或）
console.log('\n=========== 标记位 = b86位 + delta? ===========');
for (const s of trip) {
  const b86 = decodeB86(s.cd);
  const cap = s.cap;
  const deltas = marks.map(m => {
    if (cap[m] === undefined || b86[m + 2] === undefined) return 'X';
    return (cap[m] - b86[m + 2] + 256) % 256;
  });
  console.log(`nsd=${s.nsd}: delta(标记-b86)=[${deltas.join(',')}]`);
}

// 标记位 vs cap 其他位置的关系：标记位可能来自 cap 内部某固定数组
console.log('\n=========== 标记位是否 = cap[0:24] 中某字节? ===========');
for (const s of trip) {
  const cap = s.cap;
  const mk = cap[24];
  // 在 cap[0:24] 中找相同值
  const hits = [];
  for (let i = 0; i < 24; i++) if (cap[i] === mk) hits.push(i);
  if (hits.length) console.log(`nsd=${s.nsd}: cap[24]=${mk} 在 cap[0:24] 位置 ${hits.join(',')} 找到`);
}

// 关键：cap[24] 与 nsd/cd 前缀的哈希关系
console.log('\n=========== cap[24] 与 nsd/cd 长度 ===========');
for (const s of trip) {
  console.log(`nsd=${s.nsd}: cap[24]=${s.cap[24]} cap[40]=${s.cap[40]} cdLen=${s.cd.length} capLen=${s.cap.length}`);
}
