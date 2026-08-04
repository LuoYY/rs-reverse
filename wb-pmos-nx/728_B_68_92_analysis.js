/**
 * 728_B_68_92_analysis.js
 * 聚焦 base[68:92] 24 字节（真正随 cd 变的部分）
 * 分析其与 cd/b86/cap[25:28]/keys2 的关系
 * 用 nx_triple_dataset.json（含 base/cap/keys2）中 base[26]==233 的标准会话
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

// 标准会话（base[26]==233）
const NORMAL = samples.filter(s => s.base[26] === 233);
console.log('标准会话:', NORMAL.map(s => s.nsd).join(','));

console.log('\n=== base[68:92] 24 字节 ===');
for (const s of NORMAL) {
  console.log(`nsd=${s.nsd}: ${s.base.slice(68, 92).join(',')}`);
}

// 对比 cap[25:28]（明文basearr marker 区域）
console.log('\n=== cap[25:28]（明文 basearr marker） ===');
for (const s of NORMAL) {
  console.log(`nsd=${s.nsd}: cap[25:28]=${s.cap.slice(25, 28).join(',')} cap[24:28]=${s.cap.slice(24, 28).join(',')}`);
}

// base[68:92] vs cap 的关系
console.log('\n=== base[68:92] vs cap 各偏移 ===');
for (const s of NORMAL) {
  const seg = s.base.slice(68, 92);
  const cap = s.cap;
  // 找 cap 中与 seg 前缀匹配的位置
  let bestOff = -1, bestM = 0;
  for (let off = 0; off < cap.length - 5; off++) {
    let m = 0;
    for (let i = 0; i < Math.min(24, cap.length - off); i++) {
      if (seg[i] === cap[off + i]) m++; else break;
    }
    if (m > bestM) { bestM = m; bestOff = off; }
  }
  console.log(`nsd=${s.nsd}: cap 最优偏移=${bestOff} 匹配=${bestM}/24`);
}

// base[68:92] vs keys2
console.log('\n=== base[68:92] vs keys2 XOR ===');
for (const s of NORMAL) {
  const seg = s.base.slice(68, 92);
  const x = seg.map((v, i) => v ^ s.keys2[i]);
  console.log(`nsd=${s.nsd}: XOR=${x.join(',')}`);
}
