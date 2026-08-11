// 精确定位：base 中真正随会话变化的字节（排除模板/滚动串）
// 方法：4 样本逐字节对比，找"非模板"位置 + 识别滚动窗口
const samples = require('./nx_env_samples.json');

// 1. 尾部 40B 对齐对比
console.log('=== 尾部 40B 逐字节 ===');
const T = 40;
for (let i = 0; i < T; i++) {
  const vals = samples.map(s => s.base[s.base.length - T + i]);
  const uniq = new Set(vals);
  if (uniq.size > 1) console.log('tail[-' + (T - i) + '] ' + uniq.size + '值: ' + [...uniq].join(','));
}
console.log('(未列出=恒定)');

// 2. 前 78 字节对比（绝对位置）
console.log('\n=== [0:78] 逐字节 ===');
for (let i = 0; i < 78; i++) {
  const vals = samples.map(s => s.base[i]);
  const uniq = new Set(vals);
  if (uniq.size > 1) console.log('[' + i + '] ' + uniq.size + '值: ' + [...uniq].join(','));
}
console.log('(未列出=恒定)');

// 3. 找滚动窗口：各样本 [len-40-30:len-40] 段
console.log('\n=== [len-70:len-40]（尾部前 30B） ===');
samples.forEach((s, i) => {
  console.log('#' + i + ' [' + (s.base.length - 70) + ':' + (s.base.length - 40) + ']=' + s.base.slice(s.base.length - 70, s.base.length - 40).join(','));
});
