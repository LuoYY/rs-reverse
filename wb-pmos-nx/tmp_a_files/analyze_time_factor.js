// 分析 [78:90] 与时间戳的关系：是否 = f(r2mka, startT, keys)？
const samples = require('./nx_full_samples.json');

console.log('=== [78:90] vs r2mka/startT/keys2/keys17 ===');
samples.forEach((s, i) => {
  console.log('#' + i, 'r2mka=' + s.r2mka, 'startT=' + s.startT,
    'dt=' + (s.startT - s.r2mka),
    '[78:90]=' + s.base.slice(78, 90).join(','));
});

// 尝试 [78:90] = f(r2mka) 的低位
console.log('\n=== r2mka 低位 vs [78] 低位 ===');
samples.forEach((s, i) => {
  const r2 = s.r2mka;
  const b78 = s.base[78];
  console.log('#' + i, 'r2mka&255=' + (r2 & 255), 'r2mka>>8&255=' + ((r2 >> 8) & 255), 'b78=' + b78, 'b78^r2low=' + (b78 ^ (r2 & 255)));
});

// 尝试 [78:90] 是否含时间戳的加密（r2mka 4字节 XOR 某常量）
console.log('\n=== [78:90] 前4字节 vs r2mka 4字节 ===');
samples.forEach((s, i) => {
  const r2 = s.r2mka;
  const bytes = [(r2 >> 24) & 255, (r2 >> 16) & 255, (r2 >> 8) & 255, r2 & 255];
  const seg = s.base.slice(78, 82);
  const xor = seg.map((v, j) => v ^ bytes[j]);
  console.log('#' + i, 'r2mka4=' + bytes.join(','), '[78:82]=' + seg.join(','), 'XOR=' + xor.join(','));
});
