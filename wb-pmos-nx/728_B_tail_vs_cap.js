/**
 * 728_B_tail_vs_cap.js
 * base[92:165] 编码敏感区 vs cap（明文 basearr）
 * 使用 triple 数据集（有 cap）
 * 注意：triple 的 base[29:68] 与 pairs 不同（提取偏差），但仍可用其 [92:] 结构
 */
const fs = require('fs');
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;
const NORMAL = trip.filter(s => s.base[26] === 233);

// base[92:116] vs cap 各偏移
console.log('=== base[92:116] vs cap 偏移匹配 ===');
for (const s of NORMAL) {
  const seg = s.base.slice(92, 116);
  const cap = s.cap;
  let bestOff = -1, bestM = 0;
  for (let off = 0; off < cap.length - 5; off++) {
    let m = 0;
    for (let i = 0; i < Math.min(24, cap.length - off); i++) {
      if (seg[i] === cap[off + i]) m++; else break;
    }
    if (m > bestM) { bestM = m; bestOff = off; }
  }
  console.log(`nsd=${s.nsd}: bestOff=${bestOff} match=${bestM}/24`);
}

// 检查 base 尾部固定锚点 59,117,75,139,176,0,0 在 cap 中
console.log('\n=== 固定锚点 59,117,75,139,176,0,0 在 cap 中 ===');
for (const s of NORMAL) {
  const anchor = '59,117,75,139,176,0,0';
  const capStr = s.cap.join(',');
  console.log(`nsd=${s.nsd}: 锚点在 cap 中: ${capStr.indexOf(anchor)}`);
}

// cap 中是否含 139,176 等值（basearr marker 特征）
console.log('\n=== cap 值域 ===');
for (const s of NORMAL) {
  console.log(`nsd=${s.nsd}: cap 唯一值=${new Set(s.cap).size} max=${Math.max(...s.cap)}`);
}
