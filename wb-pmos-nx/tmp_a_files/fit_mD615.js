// 黑盒拟合 _$mD[615]：128B 输出 vs 输入时间戳（pl）的关系
const calls = require('./nx_mD_calls.json');
const c128 = calls.filter(c => c.after && c.after.length === 128);
const c230 = calls.filter(c => c.after && c.after.length === 230);

console.log('128B 调用数:', c128.length, '230B 调用数:', c230.length);

// 128B 输出逐字节分析：哪些固定，哪些随 pl 变
const len = 128;
const fixedCount = [];
const vary = [];
for (let i = 0; i < len; i++) {
  const vals = new Set(c128.map(c => c.after[i]));
  if (vals.size === 1) fixedCount.push(i);
  else vary.push(i);
}
console.log('128B 固定位置 (' + fixedCount.length + '):', fixedCount.join(','));
console.log('128B 变化位置 (' + vary.length + '):', vary.join(','));

// 看变化位置的字节与 pl 的关系（pl 差 → 字节差）
console.log('\n=== 变化字节 vs pl 差异 ===');
// 选 pl 差最小的两对
const pairs = [];
for (let i = 0; i < c128.length; i++) for (let j = i + 1; j < c128.length; j++) {
  const d = Math.abs(c128[i].pl - c128[j].pl);
  pairs.push({ i, j, d });
}
pairs.sort((a, b) => a.d - b.d);
console.log('最接近的 pl 对:', pairs.slice(0, 3).map(p => '#' + p.i + '(' + c128[p.i].pl + ') vs #' + p.j + '(' + c128[p.j].pl + ') 差=' + p.d));
const p0 = pairs[0];
const a = c128[p0.i].after, b = c128[p0.j].after;
const diffs = [];
for (let i = 0; i < len; i++) if (a[i] !== b[i]) diffs.push(i);
console.log('差异位置:', diffs.join(','));
diffs.forEach(i => console.log('  @' + i + ': #' + p0.i + '=' + a[i] + ' #' + p0.j + '=' + b[i] + ' xor=' + (a[i] ^ b[i])));
console.log('pl 差:', p0.d, '→ 时间戳十六进制差:', (c128[p0.j].pl - c128[p0.i].pl).toString(16));

// 230B 输出（固定）
console.log('\n=== 230B 输出（3 次相同）===');
console.log('head[0:20]:', c230[0].after.slice(0, 20).join(','));
console.log('tail[-10:]:', c230[0].after.slice(-10).join(','));

// 128B vs 230B 是否有公共部分
console.log('\n=== 128B #0 vs 230B #0 对比 ===');
const a128 = c128[0].after, a230 = c230[0].after;
let same128_230 = 0;
for (let i = 0; i < 128; i++) if (a128[i] === a230[i]) same128_230++;
console.log('相同字节:', same128_230 + '/128');
// 128B 是否在 230B 中作为子序列
const sub = a128.join(',');
console.log('128B 是 230B 子序列:', a230.join(',').includes(sub));
