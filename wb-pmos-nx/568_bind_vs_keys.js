/**
 * 568_bind_vs_keys.js
 * 系统对比绑定字节 [26-29]+[84-87] 与所有 keys 数组的关系
 * 检查：是否 = keys[i] 的切片 / 加密 / XOR / 哈希
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

// S1/S2 绑定字节
const b1 = d[0].basearr, b2 = d[1].basearr;
const k1 = d[0].keys, k2 = d[1].keys;

const bind1 = [...b1.slice(26, 30), ...b1.slice(84, 88)];
const bind2 = [...b2.slice(26, 30), ...b2.slice(84, 88)];
console.log('绑定字节 S1:', bind1.map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('绑定字节 S2:', bind2.map(x => x.toString(16).padStart(2, '0')).join(' '));

// 1. 直接匹配 keys 切片
console.log('\n=== keys 切片直接匹配 ===');
for (let ki = 0; ki < k1.length; ki++) {
  const a = k1[ki], b = k2[ki];
  if (!a || !b) continue;
  // 找 4 字节连续匹配
  for (let win = 4; win <= 8; win++) {
    for (let j = 0; j + win <= a.length; j++) {
      const sa = a.slice(j, j + win), sb = b.slice(j, j + win);
      const ia = bind1.slice(0, win), ib = bind2.slice(0, win);
      if (JSON.stringify(sa) === JSON.stringify(ia) || JSON.stringify(sb) === JSON.stringify(ib)) {
        console.log(`★ keys[${ki}][${j}-${j + win - 1}] 匹配绑定[0-${win - 1}]`);
      }
    }
  }
}

// 2. 绑定字节差 vs keys 差
console.log('\n=== 绑定字节差 vs keys 字节差 ===');
const bd1 = bind1.map((x, i) => x ^ bind2[i]);
console.log('绑定差:', bd1.map(x => x.toString(16).padStart(2, '0')).join(' '));
for (let ki = 0; ki < k1.length; ki++) {
  const a = k1[ki], b = k2[ki];
  if (!a || !b || a.length !== b.length) continue;
  for (let j = 0; j < a.length; j++) {
    const diff = a[j] ^ b[j];
    for (let bi = 0; bi < 8; bi++) {
      if (diff === bd1[bi] && diff !== 0) {
        console.log(`★ 绑定差[${bi}]=${diff.toString(16)} = keys[${ki}][${j}] 差`);
      }
    }
  }
}

// 3. keys[22] 与绑定字节（xb 的 [6] 段是 keys22 加密）
console.log('\n=== keys[22] 分析 ===');
for (let s = 0; s < 2; s++) {
  const k22 = d[s].keys[22];
  console.log(`S${s + 1} keys22(${k22.length}):`, k22.map(x => x.toString(16).padStart(2, '0')).join(' '));
}
// 绑定字节 [84-87] 是否 = keys22 的切片/哈希
const k22a = d[0].keys[22], k22b = d[1].keys[22];
const b84 = b1.slice(84, 88), b84b = b2.slice(84, 88);
console.log('S1 [84-87]:', b84.map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('S2 [84-87]:', b84b.map(x => x.toString(16).padStart(2, '0')).join(' '));

// 4. 绑定字节大端值（是否时间戳/计数）
const v26 = b1.slice(26, 30).reduce((a, x) => a * 256 + x, 0);
const v84 = b1.slice(84, 88).reduce((a, x) => a * 256 + x, 0);
console.log('\nS1 [26-29] 大端:', v26, '[84-87] 大端:', v84);
const v26b = b2.slice(26, 30).reduce((a, x) => a * 256 + x, 0);
const v84b = b2.slice(84, 88).reduce((a, x) => a * 256 + x, 0);
console.log('S2 [26-29] 大端:', v26b, '[84-87] 大端:', v84b);
console.log('差:', v26b - v26, v84b - v84);
