/**
 * 815_basearr_diff.js 方向B：basearr 字节级 diff 反推字段公式
 * 用现有样本（8实时+26历史=34+）按字节位置分类：
 * 恒定 / f(nsd,cd) / 时间相关 / 校验和候选
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('wb-pmos-nx/tmp_b_files/728_B_all_forms.json', 'utf8'));
const pairs = JSON.parse(fs.readFileSync('wb-pmos-nx/tmp_b_files/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('wb-pmos-nx/tmp_b_files/nx_triple_dataset.json', 'utf8')).samples;
const a236 = JSON.parse(fs.readFileSync('wb-pmos-nx/tmp_b_files/nx_A236_blocks.json', 'utf8'));
const a236arr = Array.isArray(a236) ? a236 : Object.values(a236);

const samples = [];
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, base: s.base179, cap: s.cap, keys2: s.keys2 });
for (const s of pairs) samples.push({ src: 'pairs', nsd: s.nsd, base: s.base, cap: null, keys2: s.keys2 });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, base: s.base, cap: s.cap, keys2: s.keys2 });
for (const s of a236arr) samples.push({ src: 'a236', nsd: s.name, base: s.base, cap: null, keys2: null });

console.log('总样本:', samples.length);
const maxLen = Math.max(...samples.map(s => s.base.length));

// 字节级分类
console.log('\n=== basearr 字节级分类（对齐头部 [0:]，尾部 [len-50:]）===');
console.log('\n[前部 0..110]（头部对齐）:');
for (let i = 0; i < 110; i++) {
  const vals = samples.map(s => s.base[i]).filter(v => v !== undefined);
  if (vals.length < 5) continue;
  const uniq = new Set(vals).size;
  const type = uniq === 1 ? '固定' : (uniq <= 8 ? `少变(${uniq}种)` : '多变');
  if (type !== '固定') {
    const sampleVals = [...new Set(vals)].slice(0, 8).join(',');
    console.log(`  [${i}] ${type} 值=${sampleVals}`);
  } else {
    console.log(`  [${i}] 固定 = ${vals[0]}`);
  }
}

console.log('\n[尾部 60 字节]（尾部对齐）:');
for (let t = 1; t <= 60; t++) {
  const vals = samples.map(s => s.base[s.base.length - t]).filter(v => v !== undefined);
  if (vals.length < 5) continue;
  const uniq = new Set(vals).size;
  const type = uniq === 1 ? '固定' : (uniq <= 8 ? `少变(${uniq}种)` : '多变');
  if (type === '固定') console.log(`  尾部[-${t}] 固定 = ${vals[0]}`);
  else console.log(`  尾部[-${t}] ${type} 值=[${[...new Set(vals)].slice(0, 8).join(',')}]`);
}

// 关键：活时间相关检测（用 live 样本的采集顺序？无时间戳。改为对比 A236 同组）
console.log('\n=== A236 同组内（同环境不同cd）逐字节差异 ===');
const a236s = samples.filter(s => s.src === 'a236');
for (let i = 0; i < 110; i++) {
  const vals = a236s.map(s => s.base[i]).filter(v => v !== undefined);
  if (vals.length < 3) continue;
  const uniq = new Set(vals).size;
  if (uniq > 1 && uniq <= 5) console.log(`  [${i}] ${uniq}种 [${[...new Set(vals)].join(',')}]`);
}

// 校验和候选：检查某些位置是否 = 其他位置的函数
console.log('\n=== 校验和候选（[22:29] 与 [68:75] 等配对已在 802/804 发现）===');
console.log('802 实验已证: [22:29] 与 [68:75] 配对（单独改412/一起改200），非简单XOR');
console.log('811 实验已证: base 整体自洽（混搭412）');

// 输出结构总结
console.log('\n=== basearr 结构总结 ===');
console.log('[0:22]  固定头（18样本一致）');
console.log('[22:29] 会话段（与[68:75]配对，f(cd) 确定性+随机混合）');
console.log('[29:68] 固定段（pairs内恒定，A236不同环境可能变）');
console.log('[68:73] env73（f(cd) 确定性，内层VM加密，19种模式）');
console.log('[73:75] 同cd固定（[73:75]随cd变）');
console.log('[75:110] 块区（前导随机+块核心6模板+块特有尾+公共段）');
console.log('[110:137] 变体区（同环境固定，随cd变）');
console.log('[137:] 固定尾（33B，尾部对齐）');
