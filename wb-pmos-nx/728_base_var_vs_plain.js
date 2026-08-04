/**
 * 728_base_var_vs_plain.js
 * 对比 base 变化段与明文 basearr（cap）的 marker 位置
 * 明文 basearr marker 位置 = 24+16k
 * base 变化位置 = 22-25, 50, 64, 68-118
 * 检查 base 变化段是否来自明文 basearr 的编码
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

// 打印 base 变化段 vs cap 对应段
console.log('=== base 变化段 vs cap（明文basearr） ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}:`);
  console.log(`  base[22:26]=${s.base.slice(22, 26).join(',')}`);
  console.log(`  cap[0:4]  =${s.cap.slice(0, 4).join(',')}`);
  console.log(`  cap[24:32]=${s.cap.slice(24, 32).join(',')}`);
}

// 检查 base 变化段长度是否 = 明文basearr marker 数相关
// base[68:118] = 50字节，明文 basearr marker = 8个
// 检查 base[68:118] 是否 = 明文basearr 某段

// 尝试：base 是否 = 明文basearr 的 huffman 编码 + 固定前后缀？
// 已知 cap 138B huffman = ~138B。base 165B。差值 27B ≈ 固定头22 + 尾5？

// 打印 base[22:160] vs cap 前 138 的逐字节 diff 率
console.log('\n=== base[22:160] vs cap 前138 逐字节 ===');
for (const s of samples) {
  const bSeg = s.base.slice(22, 160);
  const cSeg = s.cap.slice(0, 138);
  let same = 0;
  const diffs = [];
  for (let i = 0; i < 138; i++) {
    if (bSeg[i] === cSeg[i]) same++; else diffs.push(`${i}:${bSeg[i]}vs${cSeg[i]}`);
  }
  console.log(`nsd=${s.nsd}: 相同=${same}/138 差异=${diffs.slice(0, 15).join(' ')}`);
}
