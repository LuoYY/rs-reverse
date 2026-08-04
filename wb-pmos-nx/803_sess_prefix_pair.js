/**
 * 803_sess_prefix_pair.js 分析 [22:29] 与 [68:75] 的配对关系
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;
const a236 = JSON.parse(fs.readFileSync('/tmp/nx_A236_blocks.json', 'utf8'));
const a236arr = Array.isArray(a236) ? a236 : Object.values(a236);

const samples = [];
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, base: s.base179 });
for (const s of pairs) samples.push({ src: 'pairs', nsd: s.nsd, base: s.base });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, base: s.base });
for (const s of a236arr) samples.push({ src: 'a236', nsd: s.name, base: s.base });

console.log('=== [22:29] vs [68:75] 对照 ===');
for (const s of samples) {
  const b = s.base;
  if (b.length < 75) continue;
  const sess = b.slice(22, 29);
  const pre = b.slice(68, 75);
  const x = sess.map((v, i) => v ^ pre[i]);
  console.log(`[${s.src} ${s.nsd}] sess=[${sess.join(',')}] pre=[${pre.join(',')}] XOR=[${x.join(',')}]`);
}

// XOR 恒定检查
console.log('\n=== [22:29] XOR [68:75] 跨样本恒定? ===');
const xors = new Set();
for (const s of samples) {
  const b = s.base;
  if (b.length < 75) continue;
  const x = b.slice(22, 29).map((v, i) => v ^ b[68 + i]).join(',');
  xors.add(x);
}
console.log('不同 XOR 模式数:', xors.size);
for (const x of xors) console.log(' ', x);

// 求和/哈希
console.log('\n=== [22:29] 与 [68:75] 的其他关系 ===');
for (const s of samples.slice(0, 10)) {
  const b = s.base;
  if (b.length < 75) continue;
  const sess = b.slice(22, 29);
  const pre = b.slice(68, 75);
  const sumS = sess.reduce((a, v) => a + v, 0);
  const sumP = pre.reduce((a, v) => a + v, 0);
  console.log(`nsd=${s.nsd}: sessSum=${sumS} preSum=${sumP} diff=${sumS - sumP} sess^pre(异或和)=${sess.reduce((a, v, i) => a ^ (v ^ pre[i]), 0)}`);
}
