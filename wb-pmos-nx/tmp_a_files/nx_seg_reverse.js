// 反推 nx base 的 seg 结构：从 6 样本对比 seg 边界与内容
// nx base = numarrJoin 结构（类似 xj），各 seg 由标记符分割
// 关键：找 base 中的"段标记"（类似 xj 的 3/10/7/0/6/2/9/13）
const samples = require('./nx_full_samples.json');

// 1. 完整打印 base（找规律）
console.log('=== base 全览（s#0） ===');
const b0 = samples[0].base;
console.log('len=' + b0.length);
b0.forEach((v, i) => {
  if (i % 16 === 0) process.stdout.write('\n[' + i + '] ');
  process.stdout.write(v + (v < 10 ? '   ' : v < 100 ? '  ' : ' '));
});
console.log();

// 2. 各样本逐字节对比（找恒定/变化 seg）
console.log('\n=== 跨样本字节稳定性 ===');
const lens = samples.map(s => s.base.length);
const maxLen = Math.max(...lens);
for (let i = 0; i < maxLen; i++) {
  const vals = samples.map(s => s.base[i]).filter(v => v !== undefined);
  const uniq = new Set(vals);
  if (uniq.size === 1) process.stdout.write('=');
  else if (uniq.size === vals.length) process.stdout.write('?');
  else process.stdout.write('-');
  if (i % 5 === 4) process.stdout.write(' ');
  if (i % 50 === 49) process.stdout.write('\n');
}
console.log('\n= 恒定 ? 全变 - 部分变');

// 3. 检查是否含 numarrJoin 的段标记模式
console.log('\n=== 段标记候选 ===');
// xj 用 [3, len, seg...] 开头。nx 的 [0]=59 是 ';'，可能是特殊。
// 检查 [1:4] 等是否像段标记
console.log('s0[0:10]:', b0.slice(0, 10).join(','));
console.log('s0[68:78]:', b0.slice(68, 78).join(','));
console.log('s0[90:100]:', b0.slice(90, 100).join(','));
console.log('s0[108:118]:', b0.slice(108, 118).join(','));
console.log('s0[137:147]:', b0.slice(137, 147).join(','));

// 4. 找含 0 的段边界（numarrJoin 用 0 表示常量？）
console.log('\n=== 各样本 0 的位置 ===');
for (const s of samples) {
  const zeros = [];
  s.base.forEach((v, i) => { if (v === 0) zeros.push(i); });
  console.log('len=' + s.base.length + ' 0位置:', zeros.join(','));
}
