// 验证：[78:90] 是否是某个"会话串"的滚动窗口（类似 [146:152]）
// 若 [78:90] 是滚动窗口 → 它 = 会话相关串（可能含 keys 派生）在不同 len 下的切片
const samples = require('./nx_full_samples.json');

// 方法：把 [78:90] 拼接到尾部固定串前面，检查是否形成连续串
// 假设 base 结构 = [0:25] + [会话串 S] + [尾部固定串 T]
// [78:90] 落在 S 内，[146:152] 落在 T 内

// 观察：所有样本尾部 T 相同，从 len-40 开始
const T = samples[1].base.slice(-40); // 用 #1 的尾部（len=164 最标准）
console.log('尾部 T(40B):', T.join(','));

// [146:152] 应 = T[len-146 偏移]
samples.forEach((s, i) => {
  const rel = s.base.length - 146; // [146] 相对尾部
  const expect = T.slice(rel, rel + 6);
  const actual = s.base.slice(146, 152);
  console.log('#' + i + ' len=' + s.base.length + ' [146:152]=' + actual.join(',') + ' T窗口@' + rel + '=' + expect.join(',') + ' → ' + (JSON.stringify(expect) === JSON.stringify(actual) ? '✓' : '✗'));
});

// 现在看 [78:90]：是否有类似滚动？用 T 无法解释（78 离尾部太远）
// 尝试：把 [78:90] 与 T 拼接成超串，检查是否所有样本落在同一"超串"
console.log('\n=== [78:90] vs 尾部超串 ===');
// 构造超串：拼接所有样本的 [78:len] 找 LCS
// 简化：用 #3/#4/#5（len 160/161/162）找共同子串
const A = samples[3].base.slice(70), B2 = samples[4].base.slice(70), C = samples[5].base.slice(70);
console.log('#3[70:]', A.join(','));
console.log('#4[70:]', B2.join(','));
console.log('#5[70:]', C.join(','));
