// 分析 S 段（base[68:len-40]）的结构：哪些字节随 keys 变、哪些固定
// 目标：找到 [78:90] 的确定性依赖
const samples = require('./nx_full_samples.json');

console.log('=== base[68:len-40]（S 段）跨样本 ===');
samples.forEach((s, i) => {
  const S = s.base.slice(68, s.base.length - 40);
  console.log('#' + i + ' S.len=' + S.length + ' S=' + S.join(','));
});

// S 相对位置 [78:90] 在 S 中 = [10:22]
console.log('\n=== [78:90] 在 S 中的偏移 ===');
samples.forEach((s, i) => {
  const S = s.base.slice(68, s.base.length - 40);
  // [78] 在 S 中偏移 = 78-68 = 10
  console.log('#' + i + ' S[10:22]=' + S.slice(10, 22).join(','));
});

// 检查 S 是否 = f(keys2[0:22]) 或其他
console.log('\n=== S 与 keys 尝试 ===');
// 尝试 S[i] = k2[p] XOR k17[q] 或 S = k2 的某种分组
for (const s of samples.slice(0, 2)) {
  const S = s.base.slice(68, s.base.length - 40);
  const k2 = s.keys2, k17 = s.keys17;
  // 检查 S[0:22] == k2[0:22] XOR 常量
  for (let c = 0; c < 256; c++) {
    if (S.slice(0, 22).every((v, j) => (v === ((k2[j] ^ c) & 255)))) {
      console.log('★ S[0:22] = k2[0:22] XOR ' + c);
    }
  }
}

// 尝试 S = encryptMode1(keys2) 结构
console.log('\n=== S 内部结构（子串重复） ===');
for (const s of samples) {
  const S = s.base.slice(68, s.base.length - 40);
  // 找 S 中重复模式
  const first = S[0], second = S[1];
  console.log('#' + samples.indexOf(s) + ' S head=' + S.slice(0, 8).join(',') + ' S tail=' + S.slice(-8).join(','));
}

// 检查 0 的分布（分隔符？）
console.log('\n=== 0 的位置分布 ===');
for (const s of samples) {
  const S = s.base.slice(68, s.base.length - 40);
  const zeros = [];
  S.forEach((v, i) => { if (v === 0) zeros.push(i); });
  console.log('#' + samples.indexOf(s) + ' S 中 0 位置: ' + zeros.join(','));
}
