// 分析 _$mD[615] 调用：输出数组（after kt）内容，理解 base 编码结构
const calls = require('./nx_mD_calls.json');
console.log('调用数:', calls.length);
// 230B 的调用
const c230 = calls.filter(c => c.after && c.after.length === 230);
console.log('230B 调用数:', c230.length);
c230.slice(0, 3).forEach((c, i) => {
  console.log('#' + i + ' head:', c.after.slice(0, 40).join(','));
  console.log('   tail:', c.after.slice(-10).join(','));
  console.log('   ez:', c.ez, 'pl:', c.pl);
});
// 128B 的调用
const c128 = calls.filter(c => c.after && c.after.length === 128);
console.log('\n128B 调用数:', c128.length);
c128.slice(0, 3).forEach((c, i) => {
  console.log('#' + i + ' head:', c.after.slice(0, 40).join(','));
  console.log('   ez:', c.ez, 'pl:', c.pl);
});
// 230B 数组间对比
console.log('\n=== 230B 数组对比 ===');
if (c230.length >= 2) {
  const a = c230[0].after, b = c230[1].after;
  const diffs = [];
  for (let i = 0; i < 230; i++) if (a[i] !== b[i]) diffs.push(i);
  console.log('230B #0 vs #1 差异 (' + diffs.length + '):', diffs.slice(0, 30).join(','));
  // head 对比
  console.log('#0 head[0:16]:', a.slice(0, 16).join(','));
  console.log('#1 head[0:16]:', b.slice(0, 16).join(','));
  // 是否有固定部分
  let fixed = 0;
  for (let i = 0; i < 230; i++) if (a[i] === b[i]) fixed++;
  console.log('固定字节:', fixed + '/230');
}
// 128B 数组间对比
console.log('\n=== 128B 数组对比 ===');
if (c128.length >= 2) {
  const a = c128[0].after, b = c128[1].after;
  let fixed = 0;
  for (let i = 0; i < 128; i++) if (a[i] === b[i]) fixed++;
  console.log('#0 vs #1 固定字节:', fixed + '/128');
  const diffs = [];
  for (let i = 0; i < 128; i++) if (a[i] !== b[i]) diffs.push(i);
  console.log('差异位置 (' + diffs.length + '):', diffs.slice(0, 20).join(','));
  console.log('#0 head[0:32]:', a.slice(0, 32).join(','));
  console.log('#1 head[0:32]:', b.slice(0, 32).join(','));
}
