/**
 * 788_build_io_pairs.js
 * 构建 cap→base 输入输出对（供 AgentA 反编译验证）
 * 输出 /tmp/nx_io_pairs.json
 * 同时分析：cap 各位置动态性 + cap 与 base[68:82] 前缀的关系
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

// 收集 cap+base 对
const pairs = [];
for (const s of live) pairs.push({ src: 'live', nsd: s.nsd, cap: s.cap, base: s.base179, keys2: s.keys2 });
for (const s of trip) pairs.push({ src: 'triple', nsd: s.nsd, cap: s.cap, base: s.base, keys2: s.keys2 });

// 保存 IO 对
const ioPairs = pairs.map(p => ({ nsd: p.nsd, cap: p.cap, base: p.base, base68: p.base.slice(68, 92) }));
fs.writeFileSync('/tmp/nx_io_pairs.json', JSON.stringify(ioPairs, null, 1));
console.log('IO 对保存: /tmp/nx_io_pairs.json', ioPairs.length, '样本');

// cap 动态性分析
console.log('\n=== cap 各位置动态性（跨样本 unique 数）===');
const capMax = Math.min(...pairs.map(p => p.cap.length));
for (let i = 0; i < capMax; i++) {
  const vals = new Set(pairs.map(p => p.cap[i]));
  if (vals.size > 1) console.log(`cap[${i}]: ${vals.size}种值 [${[...vals].join(',')}]`);
}

// cap 固定位置统计
const fixedCap = [];
for (let i = 0; i < capMax; i++) {
  const vals = new Set(pairs.map(p => p.cap[i]));
  if (vals.size === 1) fixedCap.push(i);
}
console.log('\ncap 固定位置:', fixedCap.join(','));

// 关键：cap 动态位置 vs base[68:92] 关系
console.log('\n=== cap 动态位置 + base[68:92] 对照 ===');
for (const p of pairs) {
  const dyn = [];
  for (let i = 0; i < capMax; i++) {
    const vals = new Set(pairs.map(x => x.cap[i]));
    if (vals.size > 1) dyn.push(`${i}:${p.cap[i]}`);
  }
  console.log(`nsd=${p.nsd}: cap动态=[${dyn.join(' ')}] base[68:92]=[${p.base.slice(68,92).join(',')}]`);
}

// cap 尾部（超过 base 部分）分析
console.log('\n=== cap vs base 长度 ===');
for (const p of pairs) console.log(`nsd=${p.nsd}: cap.len=${p.cap.length} base.len=${p.base.length} 差=${p.cap.length - p.base.length}`);

// 检查 cap[30:]（固定部分之后的动态数据）是否含 base 前缀的线索
console.log('\n=== cap 动态段 vs base 前缀 [68:82] ===');
const marks = [24, 40, 56, 72, 88, 104, 120, 136, 152, 168];
for (const p of pairs) {
  const capDyn = [];
  for (let i = 0; i < capMax; i++) {
    if (!marks.includes(i)) {
      const vals = new Set(pairs.map(x => x.cap[i]));
      if (vals.size > 1) capDyn.push(`${i}=${p.cap[i]}`);
    }
  }
  console.log(`nsd=${p.nsd}: cap非标记动态=[${capDyn.join(' ')}]`);
  console.log(`  base[68:82]=[${p.base.slice(68,82).join(',')}]`);
}
