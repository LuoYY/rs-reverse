// 分析"会话串"：同批次样本中共享的子串在 base 中的完整分布
// 判断 base 中是否存在一个"会话相关串"（随 cd/keys 变），[78:90] 是其窗口
const samples = require('./nx_full_samples.json');

// 1. 找出 #3/#4/#5（同批次）的完整 base，找共同子串
const s3 = samples[3].base, s4 = samples[4].base, s5 = samples[5].base;
console.log('#3 len=' + s3.length + ' #4 len=' + s4.length + ' #5 len=' + s5.length);

// 2. 找 #3/#4 的最长公共子串（连续）
function lcs(a, b) {
  const n = a.length, m = b.length;
  let best = { len: 0, ai: 0, bi: 0 };
  // 简化：滑动窗口匹配
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let l = 0;
      while (i + l < n && j + l < m && a[i + l] === b[j + l]) l++;
      if (l > best.len) best = { len: l, ai: i, bi: j };
    }
  }
  return best;
}
const l = lcs(s3, s4);
console.log('LCS(#3,#4) len=' + l.len + ' @#3[' + l.ai + '] @#4[' + l.bi + ']');
if (l.len > 8) console.log('串:', s3.slice(l.ai, l.ai + l.len).join(','));

// 3. 计算 [78:90] 相对位置
console.log('\n=== 各段相对尾部偏移 ===');
for (const s of samples) {
  const rel78 = s.base.length - 78;
  console.log('len=' + s.base.length + ' [78]距尾=' + rel78 + ' [90]距尾=' + (s.base.length - 90));
}

// 4. 关键：找 base 中是否存在一个"随 cd 变化的连续块"（[22:90] 之间的会话数据）
//    对比同批次 #3/#4/#5 在 [22:90] 段
console.log('\n=== 同批次 [22:90] 对比 ===');
for (const idx of [3, 4, 5]) {
  console.log('#' + idx + ' [22:90]=' + samples[idx].base.slice(22, 90).join(','));
}

// 5. 检查 keys2 前 22 字节是否与 base[22:44] 有关（[22:29] 是 k0 索引已知）
console.log('\n=== keys2 vs base[22:44] ===');
for (const idx of [3, 4, 5]) {
  const s = samples[idx];
  console.log('#' + idx + ' k2[0:22]=' + s.keys2.slice(0, 22).join(','));
  console.log('#' + idx + ' base[22:44]=' + s.base.slice(22, 44).join(','));
}
