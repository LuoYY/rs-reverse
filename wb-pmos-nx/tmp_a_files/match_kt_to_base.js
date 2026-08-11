// 匹配 _$kt 快照与真实 base：找 base 构造快照
// 本地固定 challenge（nsd=67402）的 base 可从 P cookie 解出
const writes = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_writes.json');

// 本地固定 base（从 nx_env_samples 或其他样本，但那是真实代理）
// 关键：本地固定的 base 头应该是 59,148,7,120（sdenv 环境）
// 但记录中没找到 59,148 → 说明 base 在 _$kt 中是加密形态（XOR 后）
// 或 base 头在 sdenv 下是 104,229,...（r2mka 开头）

// 分析快照的数组分段：找最长快照（最终 base）
console.log('=== 各快照 kt 长度分布 ===');
const lens = {};
writes.forEach((w, i) => {
  const l = w.kt ? w.kt.length : 0;
  if (!lens[l]) lens[l] = [];
  lens[l].push(i);
});
Object.keys(lens).map(Number).sort((a, b) => b - a).slice(0, 10).forEach(l => {
  console.log('len=' + l + ' 记录数=' + lens[l].length + ' 首记录#' + lens[l][0]);
});

// 最长快照的内容（最终 base 候选）
const maxLen = Math.max(...Object.keys(lens).map(Number));
const firstMax = lens[maxLen][0];
console.log('\n最长快照 len=' + maxLen + ' @记录#' + firstMax + ':');
console.log(writes[firstMax].kt.join(','));
console.log('\n=== 完整写入序列（按记录） ===');
writes.forEach((w, i) => {
  // 只显示 kt 长度变化点
  if (i === 0 || (w.kt && writes[i - 1].kt && w.kt.length !== writes[i - 1].kt.length)) {
    console.log('#' + i + ' cV=' + w.cV + ' len=' + (w.kt ? w.kt.length : 0) + ' head=' + (w.kt ? w.kt.slice(0, 6).join(',') : ''));
  }
});
