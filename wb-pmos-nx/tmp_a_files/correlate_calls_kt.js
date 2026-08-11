// 关联：203 次调用 vs _$kt 写入快照 → 还原每个位置写入的值来源
// 关键：op=265 调用（59 次）每次写入什么值？
const calls = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_c4_calls.json');
const writes = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_writes.json');

// op=265 调用的第三参数（要写入的值）
console.log('=== op=265 调用参数分析 ===');
const ops265 = calls.map((c, i) => ({ i, c })).filter(x => x.c.split('|')[0] === '265');
const vals = ops265.map(x => {
  const parts = x.c.split('|');
  return { i: x.i, p2: parts[1], p3: parts[2] };
});
// 统计第三参数（值）
const vFreq = {};
vals.forEach(v => { const k = (v.p3 || 'none'); vFreq[k] = (vFreq[k] || 0) + 1; });
console.log('op=265 第三参数频率（值）:');
Object.entries(vFreq).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([v, n]) => {
  console.log('  ' + v + ' ×' + n);
});

// 时间戳值 521019862 相关
console.log('\n=== 时间戳 521019862 相关调用 ===');
calls.forEach((c, i) => {
  if (c.includes('521019862')) console.log('#' + i + ': ' + c.slice(0, 80));
});

// 检查 _$kt 写入快照与调用的时间对齐
// _$kt 快照记录了 cV 游标和数组内容
// 找 base 数组（200B）最后一次完整写入
console.log('\n=== _$kt 写入最后 20 条 ===');
writes.slice(-20).forEach((w, i) => {
  console.log('#' + (writes.length - 20 + i) + ' cV=' + w.cV + ' len=' + (w.kt ? w.kt.length : 0) + ' head=' + (w.kt ? w.kt.slice(0, 8).join(',') : ''));
});
