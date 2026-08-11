// 分析 [78:90]+[146:152] = f(keys2, keys17, cd?) 数学关系
// 检查：XOR/加减/线性组合/查表等
const fs = require('fs');
const path = require('path');
const samples = require(path.join(__dirname, 'nx_full_samples.json'));

console.log('样本数:', samples.length);
samples.forEach((s, i) => {
  console.log('#' + i + ' nsd=' + s.nsd + ' len=' + s.base.length + ' [78:90]=' + s.base.slice(78, 90).join(','));
});

// 1. 检查 [78:90] 是否 = keys2 某段 XOR
console.log('\n=== [78:90] vs keys2 段 XOR ===');
for (let i = 0; i < samples.length - 1; i++) {
  const a = samples[i], b = samples[i + 1];
  const segA = a.base.slice(78, 90), segB = b.base.slice(78, 90);
  const xorAB = segA.map((v, j) => v ^ segB[j]);
  // keys2 XOR
  const k2a = a.keys2, k2b = b.keys2;
  for (let off = 0; off <= k2a.length - 12; off++) {
    const k2xor = [];
    for (let j = 0; j < 12; j++) k2xor.push((k2a[off + j] ^ k2b[off + j]) & 255);
    if (xorAB.every((v, j) => v === k2xor[j])) {
      console.log('★ [78:90] 跨会话差 = keys2[' + off + ':' + (off + 12) + '] XOR 差 (#' + i + '/#' + (i + 1) + ')');
    }
  }
}

// 2. 检查 [78:90] 每字节 = keys2 某字节 XOR keys17 某字节（同样本内）
console.log('\n=== 同样本内 keys 线性关系 ===');
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  const seg = s.base.slice(78, 90);
  const k2 = s.keys2, k17 = s.keys17;
  for (let j = 0; j < 12; j++) {
    // 找 k2[p] ^ k17[q] == seg[j]
    const found = [];
    for (let p = 0; p < k2.length; p++) {
      for (let q = 0; q < k17.length; q++) {
        if (((k2[p] ^ k17[q]) & 255) === seg[j]) { found.push(p + '^' + q); }
      }
    }
    // 只报告稀疏匹配（<20 个候选）
    if (found.length > 0 && found.length < 20 && i === 0) {
      // console.log('#' + i + ' [78+' + j + ']=' + seg[j] + ' k2[p]^k17[q]: ' + found.slice(0, 10).join(' '));
    }
  }
}

// 3. 检查 [78:90] 是否含 keys2 的固定偏移子串（XOR 常量）
console.log('\n=== 寻找恒定 XOR 掩码 ===');
// 同模板组（b60=247）样本对：seg XOR = 常量？
const grp = samples.filter(s => s.b60 === 247 && s.b65 === 164);
if (grp.length >= 2) {
  for (let i = 0; i < grp.length - 1; i++) {
    const xor = grp[i].base.slice(78, 90).map((v, j) => v ^ grp[i + 1].base.slice(78, 90)[j]);
    console.log('同组#' + i + '/#' + (i + 1) + ' [78:90]差XOR=' + xor.join(','));
  }
}

// 4. 检查 base 内部 [78:90] 与 [68:73]（已知自由段）的依赖
console.log('\n=== [78:90] vs base 其他段 ===');
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  console.log('#' + i + ' [22:29]=' + s.base.slice(22, 29).join(',') + ' [68:73]=' + s.base.slice(68, 73).join(',') + ' [78:90]=' + s.base.slice(78, 90).join(','));
}

// 5. [146:152] 分析
console.log('\n=== [146:152] ===');
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  console.log('#' + i + ' len=' + s.base.length + ' [146:152]=' + s.base.slice(146, 152).join(',') + ' tail40=' + s.base.slice(-40, -33).join(','));
}
