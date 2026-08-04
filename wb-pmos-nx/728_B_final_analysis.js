/**
 * 728_B_final_analysis.js
 * 基于 pairs 权威数据集的最终 base 结构分析
 */
const fs = require('fs');
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;

// 逐位置跨 10 样本
const maxLen = Math.max(...pairs.map(s => s.base.length));
const fixed = [];
const varPos = {};
for (let i = 0; i < maxLen; i++) {
  const vals = pairs.map(s => s.base[i]).filter(v => v !== undefined);
  if (new Set(vals).size === 1) fixed.push(i);
  else varPos[i] = [...new Set(vals)];
}

console.log('=== base 完整结构（pairs 权威数据）===');
console.log('固定位置:', fixed.join(','));
console.log('\n会话/变化位置:');
for (const [k, v] of Object.entries(varPos)) {
  if (+k < 70) console.log(`[${k}]: ${v.join(',')}`);
}
console.log('\n[68:92] 变化段（真正随 cd 变）:');
for (const s of pairs) {
  console.log(`nsd=${s.nsd}: ${s.base.slice(68, 92).join(',')}`);
}

// 输出权威固定段
console.log('\n=== 权威固定段 ===');
console.log('head[0:22]:', JSON.stringify(pairs[0].base.slice(0, 22)));
console.log('mid[29:68]:', JSON.stringify(pairs[0].base.slice(29, 68)));

// 尾部两组
console.log('\n=== 尾部变体 ===');
for (const s of pairs) {
  console.log(`nsd=${s.nsd} len=${s.base.length}: tail=${s.base.slice(-12).join(',')}`);
}
