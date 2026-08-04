/**
 * 728_B_pair_sim.js
 * 分析 base[68:92] 的相似对：111259/68846 后半相似
 * 检查这些相似对是否对应 cap marker 或 b86 的相似
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;
const NORMAL = samples.filter(s => s.base[26] === 233);

// 111259 vs 68846 详细对比
const a = NORMAL.find(s => s.nsd === 111259);
const b = NORMAL.find(s => s.nsd === 68846);
console.log('=== 111259 vs 68846 base 全量差异 ===');
let diffs = [];
for (let i = 0; i < Math.max(a.base.length, b.base.length); i++) {
  if (a.base[i] !== b.base[i]) diffs.push(i);
}
console.log('差异位置:', diffs.join(','));

// 两个会话的 cap
console.log('\n=== cap 全量对比 ===');
console.log('111259 cap:', a.cap.join(','));
console.log('68846 cap:', b.cap.join(','));
let cdiff = [];
for (let i = 0; i < Math.min(a.cap.length, b.cap.length); i++) {
  if (a.cap[i] !== b.cap[i]) cdiff.push(i);
}
console.log('cap 差异位置:', cdiff.slice(0, 40).join(','));

// 检查 cap 是否高度相似
console.log('\n=== 两会话 cd 前缀 ===');
console.log('111259 cd:', a.cd.substring(0, 40));
console.log('68846 cd:', b.cd.substring(0, 40));

// 其他相似对：83602/122542
const c = NORMAL.find(s => s.nsd === 83602);
const d = NORMAL.find(s => s.nsd === 122542);
console.log('\n=== 83602 vs 122542 base 差异 ===');
let dd = [];
for (let i = 0; i < Math.max(c.base.length, d.base.length); i++) {
  if (c.base[i] !== d.base[i]) dd.push(i);
}
console.log('base 差异:', dd.join(','));
console.log('cap 差异:', (() => { let r = []; for (let i = 0; i < Math.min(c.cap.length, d.cap.length); i++) if (c.cap[i] !== d.cap[i]) r.push(i); return r.slice(0, 40).join(','); })());
