/**
 * 796_tail110.js 分析 base[110:] 的跨样本一致性（模板结构）
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

const samples = [];
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, base: s.base179 });
for (const s of pairs) samples.push({ src: 'pairs', nsd: s.nsd, base: s.base });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, base: s.base });

// 尾部对齐：从尾部数，检查固定性
console.log('=== 尾部对齐固定性（从尾部数 t=1..60）===');
const maxLen = Math.max(...samples.map(s => s.base.length));
const fixedTail = [];
for (let t = 1; t <= 60; t++) {
  const vals = samples.map(s => s.base[s.base.length - t]).filter(v => v !== undefined);
  if (new Set(vals).size === 1) fixedTail.push(-t);
}
console.log('尾部固定偏移:', fixedTail.join(','));

// 尾部绝对位置对比（对齐到各自末尾）
console.log('\n=== base 尾部 60 字节（各自对齐）===');
for (const s of samples.slice(0, 8)) {
  const b = s.base;
  console.log(`[${s.src} ${s.nsd}] len=${b.length}: tail60=${b.slice(b.length - 60, b.length).join(',')}`);
}

// 尾部是否 = 固定模板（尾部对齐后比较）
console.log('\n=== 尾部对齐差异（前3样本 vs 其余）===');
const ref = samples[0].base.slice(-60);
let diffs = 0;
for (const s of samples) {
  const tail = s.base.slice(-60);
  for (let i = 0; i < 60; i++) {
    if (tail[i] !== ref[i]) diffs++;
  }
}
console.log('总差异数（样本数×60 中）:', diffs, '/', samples.length * 60);

// [101:110] 硬编码段检查（team-lead 说）
console.log('\n=== [101:110] 一致性 ===');
for (const s of samples.slice(0, 10)) {
  console.log(`nsd=${s.nsd}: [101:110]=${s.base.slice(101, 110).join(',')}`);
}
