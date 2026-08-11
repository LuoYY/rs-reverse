// 深度分析 [78:90]：跨会话结构 + 与 [146:152] 滚动串的关系 + keys 关系
const samples = require('./nx_full_samples.json');

// 1. [78:90] 内部结构：是否有子串滚动（类似 [146:152]）？
console.log('=== [78:90] 结构（跨样本对齐） ===');
samples.forEach((s, i) => {
  console.log('#' + i + ' len=' + s.base.length + ' [78:90]=' + s.base.slice(78, 90).join(','));
});

// 2. 检查 base 中是否有贯穿多段的"滚动串"（固定串在不同 len 下出现在不同位置）
//    方法：找 [70:140] 段的重复模式
console.log('\n=== 各样本 [70:160] 段 ===');
samples.forEach((s, i) => {
  console.log('#' + i + ' len=' + s.base.length + ' [70:160]=' + s.base.slice(70, 160).join(','));
});

// 3. [78:90] 与 keys17 的关系（keys17 是 16B 或更长）
console.log('\n=== keys17 全貌 ===');
samples.forEach((s, i) => {
  console.log('#' + i + ' k17.len=' + s.keys17.length + ' k17=' + s.keys17.join(','));
  console.log('  k2.len=' + s.keys2.length);
});

// 4. 检查 [78:90] 是否 = f(keys2) 的某种结构（按位分析）
//    检查每个字节随样本的变化是否与 keys 段变化同步
console.log('\n=== 逐字节变化模式 ===');
// 对每个位置 p in [78:90]，跨样本收集值，检查是否 0/常量/全变
for (let p = 78; p < 90; p++) {
  const vals = samples.map(s => s.base[p]);
  const uniq = new Set(vals);
  console.log('[' + p + '] ' + vals.join(',') + (uniq.size === 1 ? ' ← 恒定' : uniq.size === 2 ? ' ← 2值' : ' ← 全变'));
}

// 5. 长度相关性：len 与 [78:90] 的关系
console.log('\n=== len vs [78] 起始 ===');
samples.forEach((s, i) => {
  console.log('#' + i + ' len=' + s.base.length + ' [78]=' + s.base[78] + ' [len-40]=' + s.base[s.base.length - 40]);
});

// 6. 尾部 40B 恒定验证
console.log('\n=== 尾部 40B ===');
samples.forEach((s, i) => {
  console.log('#' + i + ' tail=' + s.base.slice(-40).join(','));
});
