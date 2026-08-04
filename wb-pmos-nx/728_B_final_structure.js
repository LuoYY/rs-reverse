/**
 * 728_B_final_structure.js
 * 汇总 base 各位置的性质（200可改 / 400长度 / 412校验）
 * 结合 10 样本数据，确定哪些位置跨样本固定，哪些随 cd 变
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

// 探针结果（从运行日志）
// [68:92]: 68:412 69:412 70-82:200 83-86:412 87:400 88-89:412 90-91:400
// [92:165]: 全部412 除95:200

// 汇总跨10样本固定位置
const fixed = [];
const varPos = {};
for (let i = 0; i < 170; i++) {
  const vals = samples.map(s => s.base[i]).filter(v => v !== undefined);
  if (new Set(vals).size === 1) fixed.push(i);
  else varPos[i] = new Set(vals).size;
}

console.log('=== base 结构汇总 ===');
console.log('跨10样本完全固定:', fixed.join(','));
console.log('\n随cd变(unique>1):');
console.log([...Object.entries(varPos)].map(([k, v]) => `${k}:${v}`).join(' '));

// 结合探测结果标记每位置性质
console.log('\n=== 位置性质标记（F=固定 C=cd变 A=可任意 L=长度 U=未知）===');
const probe200 = new Set([70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 95]);
const probe400 = new Set([47, 48, 50, 87, 88, 89, 90, 91]);
const labels = [];
for (let i = 0; i < 165; i++) {
  let lab;
  if (i < 22 || (i >= 29 && i <= 67)) lab = 'F';
  else if (probe200.has(i)) lab = 'A';
  else if (probe400.has(i)) lab = 'L';
  else if (i >= 22 && i <= 28) lab = 'C(会话)';
  else lab = 'U';
  labels.push(`${i}:${lab}`);
}
console.log(labels.join(' '));
