/**
 * 590_bind_linear.js
 * 三会话绑定字节 [26-29]+[84-87] vs keys 的线性/XOR 关系
 * 关键：绑定字节 = f(keys)，跨会话 keys 变 → 绑定字节变
 * 若 f 是线性的（XOR/加减/哈希前段），用 3 会话可解
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

// 绑定字节
const binds = d.map(x => [...x.basearr.slice(26, 30), ...x.basearr.slice(84, 88)]);
console.log('三会话绑定字节 (8B):');
binds.forEach((b, i) => console.log(`S${i + 1}: ${b.map(x => x.toString(16).padStart(2, '0')).join(' ')}`));

// 每个 keys 的差异向量 vs 绑定字节差异
function diffArr(a, b) { return a.map((x, i) => x ^ b[i]); }
const b12 = diffArr(binds[0], binds[1]);
const b13 = diffArr(binds[0], binds[2]);
console.log('\n绑定差 S1^S2:', b12.map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('绑定差 S1^S3:', b13.map(x => x.toString(16).padStart(2, '0')).join(' '));

// 找 keys 中与绑定差匹配的模式（XOR 差、加减差）
for (let ki = 0; ki < d[0].keys.length; ki++) {
  const k0 = d[0].keys[ki], k1 = d[1].keys[ki], k2 = d[2].keys[ki];
  if (!k0 || !k1 || !k2) continue;
  // keys 长度必须 >= 4
  if (k0.length < 4) continue;
  // 尝试各种对齐：keys[j..j+3] 的差
  for (let j = 0; j + 4 <= k0.length; j++) {
    const xd12 = diffArr(k0.slice(j, j + 4), k1.slice(j, j + 4));
    const xd13 = diffArr(k0.slice(j, j + 4), k2.slice(j, j + 4));
    // 与绑定差前 4 或后 4 匹配
    for (let half = 0; half < 2; half++) {
      const target12 = half === 0 ? b12.slice(0, 4) : b12.slice(4, 8);
      const target13 = half === 0 ? b13.slice(0, 4) : b13.slice(4, 8);
      // 完全匹配 XOR 差
      if (JSON.stringify(xd12) === JSON.stringify(target12) && JSON.stringify(xd13) === JSON.stringify(target13)) {
        console.log(`★★ keys[${ki}][${j}-${j + 3}] XOR差 完全匹配 绑定${half === 0 ? '[26-29]' : '[84-87]'}`);
      }
      // 部分匹配（3/4 字节）
      let m = 0;
      for (let b = 0; b < 4; b++) if (xd12[b] === target12[b] && xd13[b] === target13[b]) m++;
      if (m >= 3) console.log(`★ keys[${ki}][${j}-${j + 3}] XOR差 ${m}/4 匹配 绑定${half === 0 ? '[26-29]' : '[84-87]'}`);
    }
  }
}

// 绑定字节本身是否 = keys[i] 某切片 + 常数
console.log('\n=== 绑定字节 vs keys 切片 + 常数 ===');
for (let ki = 0; ki < d[0].keys.length; ki++) {
  const k0 = d[0].keys[ki];
  if (!k0 || k0.length < 4) continue;
  for (let j = 0; j + 4 <= k0.length; j++) {
    const slice = k0.slice(j, j + 4);
    const xorC = diffArr(binds[0].slice(0, 4), slice);
    // 如果 xorC 在 3 会话都相同（常数），则绑定[26-29] = keys[ki][j..j+3] ^ const
    const s1 = diffArr(binds[1].slice(0, 4), d[1].keys[ki].slice(j, j + 4));
    const s2 = diffArr(binds[2].slice(0, 4), d[2].keys[ki].slice(j, j + 4));
    if (JSON.stringify(xorC) === JSON.stringify(s1) && JSON.stringify(xorC) === JSON.stringify(s2)) {
      console.log(`★★ 绑定[26-29] = keys[${ki}][${j}-${j + 3}] ^ [${xorC.map(x => x.toString(16).padStart(2, '0')).join(' ')}] (跨会话常数!)`);
    }
  }
}

// 绑定字节 = keys[i] 组合（加减）
console.log('\n=== 绑定字节 vs keys 2 段 XOR ===');
for (let ki = 0; ki < d[0].keys.length; ki++) {
  const k0 = d[0].keys[ki];
  if (!k0 || k0.length < 8) continue;
  for (let j = 0; j + 8 <= k0.length; j++) {
    // [26-29] = k[j..j+3] ^ k[j+4..j+7]
    const c = k0.slice(j, j + 4).map((x, t) => x ^ k0[j + 4 + t]);
    const s1 = d[1].keys[ki].slice(j, j + 4).map((x, t) => x ^ d[1].keys[ki][j + 4 + t]);
    const s2 = d[2].keys[ki].slice(j, j + 4).map((x, t) => x ^ d[2].keys[ki][j + 4 + t]);
    if (JSON.stringify(c) === JSON.stringify(binds[0].slice(0, 4)) &&
        JSON.stringify(s1) === JSON.stringify(binds[1].slice(0, 4)) &&
        JSON.stringify(s2) === JSON.stringify(binds[2].slice(0, 4))) {
      console.log(`★★ 绑定[26-29] = keys[${ki}][${j}-${j + 3}] ^ keys[${ki}][${j + 4}-${j + 7}]`);
    }
  }
}
console.log('\n完成');
