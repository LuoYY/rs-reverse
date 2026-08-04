/**
 * 728_B_tail_stability.js
 * 分析 base179 的 [92:165] 编码敏感区跨样本稳定性：
 * 若 [92:] 可模板化（固定模式），则纯算法 base179 = 固定头 + 会话段 + [68:92] + 模板尾
 * 同时分析 [22:29] 会话段与 [68:92] 是否与 cd 有关
 */
const fs = require('fs');
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

console.log('=========== pairs 10 样本 base179 [92:] 对比 ===========');
for (const s of pairs) {
  const b = s.base;
  console.log(`nsd=${s.nsd} len=${b.length}: [92:110]=${b.slice(92, 110).join(',')}`);
}

console.log('\n=========== pairs [116:165]（固定尾段）===========');
for (const s of pairs) {
  const b = s.base;
  if (b.length >= 165) console.log(`nsd=${s.nsd}: [116:165]=${b.slice(116, 165).join(',')}`);
}

console.log('\n=========== pairs [68:92]（动态段）===========');
for (const s of pairs) {
  const b = s.base;
  console.log(`nsd=${s.nsd}: [68:92]=${b.slice(68, 92).join(',')}`);
}

console.log('\n=========== pairs [22:29]（会话段）===========');
for (const s of pairs) {
  const b = s.base;
  console.log(`nsd=${s.nsd}: [22:29]=${b.slice(22, 29).join(',')}`);
}

// 统计固定位置（对齐头部）
console.log('\n=========== 固定位置统计（头部对齐）===========');
const maxLen = Math.max(...pairs.map(s => s.base.length));
const fixed = [], varPos = {};
for (let i = 0; i < 92; i++) {
  const vals = pairs.map(s => s.base[i]);
  if (new Set(vals).size === 1) fixed.push(i);
  else varPos[i] = [...new Set(vals)].slice(0, 5);
}
console.log('固定位置 [0:92]:', fixed.join(','));
console.log('可变位置 [0:92]:', Object.entries(varPos).map(([k, v]) => `${k}:${v.length}种`).join('  '));
