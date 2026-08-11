// 分析真实代理样本的 [78:90] 滚动结构
const samples = require('./nx_env_samples.json');
console.log('样本数:', samples.length);
samples.forEach((s, i) => {
  console.log('#' + i, 'len=' + s.base.length, 'b60/b65=' + s.b60 + '/' + s.b65,
    '[78:90]=' + s.base.slice(78, 90).join(','));
});

// 找跨样本共享子串（滚动窗口）
console.log('\n=== [70:110] 段 ===');
samples.forEach((s, i) => {
  console.log('#' + i, s.base.slice(70, 110).join(','));
});

// 尾部 40B
console.log('\n=== 尾部 40B ===');
samples.forEach((s, i) => {
  console.log('#' + i, s.base.slice(-40).join(','));
});
