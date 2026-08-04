/**
 * 728_B_tail_align.js
 * 按尾部对齐重新分析 base 固定段
 * base 长度 165-171 不等 → 尾部固定段应从末尾对齐
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('base 长度:', samples.map(s => s.base.length).join(','));

// 按尾部对齐（-i 表示从尾部数第 i 个位置）
const lens = samples.map(s => s.base.length);
const maxLen = Math.max(...lens);
console.log('\n=== 按尾部对齐的固定段 ===');
const tailFixed = [];
const tailVar = {};
for (let ti = 0; ti < maxLen; ti++) {
  // ti = 从尾部数的偏移，0 = 最后1字节
  const vals = samples.map(s => s.base[s.base.length - 1 - ti]);
  const uniq = new Set(vals);
  if (uniq.size === 1) tailFixed.push(ti);
  else tailVar[ti] = uniq.size;
}
console.log('尾部固定偏移(从尾部数):', tailFixed.slice(0, 60).join(','));
console.log('\n尾部可变偏移:');
console.log([...Object.entries(tailVar)].filter(([k]) => +k < 70).map(([k, v]) => `${k}:${v}`).join(' '));

// 头部对齐固定段（0-67）
console.log('\n=== 头部固定段（0-67）===');
let headFixed = [];
for (let i = 0; i < 68; i++) {
  const vals = samples.map(s => s.base[i]);
  if (new Set(vals).size === 1) headFixed.push(i);
}
console.log('头部固定:', headFixed.join(','));
