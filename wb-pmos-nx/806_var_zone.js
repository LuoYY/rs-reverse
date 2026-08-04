/**
 * 806_var_zone.js 分析 [110:137] 变体区（cd/环境绑定）
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

// [110:137] 绝对位置不统一（base 长度不同），用尾部对齐：变体区 = [len-33-27 : len-33] 附近
// 尾部固定段起点 = len-33（从尾部 t=28 起固定 33B）。变体区在固定段前。
console.log('=== 尾部固定段起点前 30B（变体区候选）===');
for (const s of samples.slice(0, 12)) {
  const b = s.base;
  const fix = b.length - 33; // 尾部固定段起点（近似）
  const varZone = b.slice(Math.max(68, fix - 30), fix);
  console.log(`[${s.src} ${s.nsd}] len=${b.length} fix@${fix} 变体区=[${varZone.join(',')}]`);
}

// A236 同 nsd 的变体区一致性
console.log('\n=== A236 同 nsd 变体区一致性 ===');
const a236s = samples.filter(s => s.src === 'a236');
for (const s of a236s) {
  const b = s.base;
  const fix = b.length - 33;
  console.log(`[${s.nsd}] len=${b.length} [68:73]=${b.slice(68, 73).join(',')} [110:137]=${b.slice(110, 137).join(',')} 变体区=${b.slice(Math.max(68, fix - 27), fix).join(',')}`);
}
