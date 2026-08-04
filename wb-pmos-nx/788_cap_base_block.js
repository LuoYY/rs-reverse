/**
 * 788_cap_base_block.js
 * cap 特征 vs base 块类型/前缀 的对应关系分析
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

const pairs = [];
for (const s of live) pairs.push({ src: 'live', nsd: s.nsd, cap: s.cap, base: s.base179 });
for (const s of trip) pairs.push({ src: 'triple', nsd: s.nsd, cap: s.cap, base: s.base });

// 识别块类型
function blockType(base) {
  const seg = base.slice(83, 92);
  const s = seg.join(',');
  if (s.startsWith('76,0,25,10,171,221,218,233,234') || s.startsWith('252,76,0,25,10,171') || s.includes('76,0,25,10,171')) return 'A';
  if (s.startsWith('105,171,119,0,221,218')) return 'A2';
  if (s.startsWith('49,144,170,189,221,174') || s.includes('49,144,170,189,221,174')) return 'B';
  if (s.startsWith('249,117,222,42,169,237') || s.includes('249,117,222,42,169,237') || s.includes('52,249,117,222,42,169') || s.includes('255,249,117,222,42,169')) return 'C';
  if (s.startsWith('77,158,17,7,119,143') || s.includes('77,158,17,7,119,143') || s.includes('0,77,158,17,7,119')) return 'D';
  if (s.startsWith('100,217,225,16,119,121') || s.includes('217,225,16,119,121,241') || s.includes('100,217,225,16,119,121')) return 'E';
  if (s.includes('70,49,144,170,189,221,174')) return 'B';
  return '?';
}

console.log('=== 样本块类型 + cap 特征 ===');
for (const p of pairs) {
  const bt = blockType(p.base);
  const cap = p.cap;
  console.log(`[${p.src} ${p.nsd}] 块=${bt} | cap[1]=${cap[1]} cap[4]=${cap[4]} cap[5]=${cap[5]} cap[24]=${cap[24]} cap[25:30]=[${cap.slice(25,30).join(',')}] | base[68:82]=[${p.base.slice(68,82).join(',')}]`);
}

// cap 固定位置汇总
console.log('\n=== cap 固定位置（16样本一致）===');
const capMax = Math.min(...pairs.map(p => p.cap.length));
const fixedCap = [];
const dynCap = [];
for (let i = 0; i < capMax; i++) {
  const vals = new Set(pairs.map(p => p.cap[i]));
  if (vals.size === 1) fixedCap.push(i);
  else dynCap.push(i);
}
console.log('固定:', fixedCap.join(','));
console.log('动态数量:', dynCap.length, '位置:', dynCap.join(','));

// cap[1] 和 cap[4] 与块类型
console.log('\n=== cap[1]/cap[4] vs 块类型 ===');
for (const bt of ['A', 'A2', 'B', 'C', 'D', 'E']) {
  const list = pairs.filter(p => blockType(p.base) === bt);
  if (!list.length) continue;
  console.log(`块${bt} (${list.length}): cap[1]=[${[...new Set(list.map(p => p.cap[1]))]}] cap[4]=[${[...new Set(list.map(p => p.cap[4]))]}] cap[5]=[${[...new Set(list.map(p => p.cap[5]))]}]`);
}
