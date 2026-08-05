/**
 * 816_fingerprint_variants.js 提取 [29:68] 指纹段变体（对照 xj 硬编码指纹）
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

// [29:68] 变体分组
const groups = {};
for (const s of samples) {
  const seg = s.base.slice(29, 68).join(',');
  (groups[seg] ||= []).push(s);
}
console.log('=== [29:68] 指纹段变体（', Object.keys(groups).length, '种）===');
for (const [seg, list] of Object.entries(groups)) {
  console.log(`\n[29:68] = ${seg}`);
  console.log(`  样本(${list.length}): ${list.map(s => `${s.src}:${s.nsd}`).join(' ')}`);
  console.log(`  env73: ${list.map(s => s.base.slice(68, 73).join(',')).join(' | ')}`);
  console.log(`  sess22: ${list.map(s => s.base.slice(22, 29).join(',')).join(' | ')}`);
}

// [0:22] 验证固定
console.log('\n=== [0:22] 固定头 ===');
const head = samples[0].base.slice(0, 22).join(',');
const allSame = samples.every(s => s.base.slice(0, 22).join(',') === head);
console.log('全部一致:', allSame, '=', head);

// xj 对照：xj basearr 开头16B稳定。nx 对应 [0:22]。
console.log('\n=== 对照 xj 骨架 ===');
console.log('xj: [指纹块(UA uuid/平台/屏幕/seg0加密)] = 硬编码 | [cd派生] | [随机]');
console.log('nx: [0:22]固定头 + [29:68]指纹段(7种变体) + [22:29]会话段(cd) + [68:73]env73(cd,VM) + [75:110]块区(自由) + [110:137]变体区(cd) + [137:]固定尾');
