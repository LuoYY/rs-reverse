// 验证假设：[78:90] 是固定"滚动串"的窗口切片（随 base 长度偏移）
// 如果成立 → [78:90] 可模板化（无需 f 公式）→ 但实验证明改值 412！
// 所以 [78:90] 是"滚动+内容校验"？需要重新理解
const samples = require('./nx_full_samples.json');

// 方法：把每个样本 [70:200] 长段拼接，找跨样本的最大公共子串（LCS）
// 简化：直接比较 [70:160] 段，找公共后缀/前缀

console.log('=== 找跨样本公共子串 ===');
// 用 #5 作为参考（len=162 较标准）
const ref = samples[5].base.slice(70, 162); // 92 元素
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  const seg = s.base.slice(70, s.base.length);
  // 找与 ref 的最长公共子串（滑动窗口）
  let best = { len: 0, refOff: 0, segOff: 0 };
  for (let a = 0; a < ref.length; a++) {
    for (let b = 0; b < seg.length; b++) {
      let l = 0;
      while (a + l < ref.length && b + l < seg.length && ref[a + l] === seg[b + l]) l++;
      if (l > best.len) best = { len: l, refOff: a, segOff: b };
    }
  }
  console.log('#' + i + ' 最长公共子串 len=' + best.len + ' (ref@' + best.refOff + ' seg@' + best.segOff + ')');
  console.log('   ref 段: ' + ref.slice(best.refOff, best.refOff + best.len).join(','));
}

// 尾部 40B 是否恒定（相对尾部）
console.log('\n=== 尾部 40B（相对尾部偏移） ===');
const T = 40;
samples.forEach((s, i) => {
  const tail = s.base.slice(-T);
  console.log('#' + i + ' tail40=' + tail.join(','));
});

// [78:90] 相对尾部位置：len-78 = 距尾部距离
console.log('\n=== [78:90] 相对尾部偏移 ===');
samples.forEach((s, i) => {
  const rel = s.base.length - 78; // [78] 距尾部
  console.log('#' + i + ' len=' + s.base.length + ' [78]距尾=' + rel);
});
