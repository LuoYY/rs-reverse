/**
 * 566_flat_analysis.js
 * 深入分析 nx 扁平 basearr 结构（无段标记）
 * 用 3 个会话对比：定位哪些字节 = f(keys)、哪些 = 环境/时间/随机
 * 同时检查 keys[22]/keys[19] 等是否以明文/加密形式出现在 basearr
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

const B = d.map(x => x.basearr);
const K = d.map(x => x.keys);

// 1. 三会话逐字节稳定性
const len = Math.max(...B.map(b => b.length));
console.log('=== 三会话逐字节分类 ===');
for (let i = 0; i < len; i++) {
  const vals = B.map(b => b[i] !== undefined ? b[i] : -1);
  const same = vals.every(v => v === vals[0]);
  if (!same) {
    console.log(`[${i}] 动态: S1=${vals[0].toString(16)} S2=${vals[1].toString(16)} S3=${vals[2].toString(16)}`);
  }
}

// 2. 动态字节 vs keys 差（S1→S2）
console.log('\n=== 动态字节差 vs keys 字节差（S1→S2）===');
const diffIdx = [];
for (let i = 0; i < Math.min(B[0].length, B[1].length); i++) {
  if (B[0][i] !== B[1][i]) diffIdx.push(i);
}
console.log('动态索引:', diffIdx.join(','));
console.log('动态值 S1:', diffIdx.map(i => B[0][i].toString(16)).join(' '));
console.log('动态值 S2:', diffIdx.map(i => B[1][i].toString(16)).join(' '));
console.log('差(XOR):', diffIdx.map(i => (B[0][i] ^ B[1][i]).toString(16)).join(' '));

// 3. keys 差异
console.log('\n=== keys 差异摘要 ===');
for (let ki = 0; ki < K[0].length; ki++) {
  const k1 = K[0][ki], k2 = K[1][ki];
  if (!k1 || !k2) continue;
  const diff = [];
  for (let j = 0; j < Math.min(k1.length, k2.length); j++) {
    if (k1[j] !== k2[j]) diff.push(j);
  }
  if (diff.length) console.log(`keys[${ki}] 差异位置: ${diff.join(',')} 值: ${diff.map(j => k1[j].toString(16) + '/' + k2[j].toString(16)).join(' ')}`);
}

// 4. keys[19]（ASCII 数字）与动态段关系
console.log('\n=== keys19 ===');
for (let s = 0; s < 3; s++) {
  const k19 = K[s][19] ? K[s][19].map(c => String.fromCharCode(c)).join('') : '?';
  console.log(`S${s + 1} keys19="${k19}" hex=${K[s][19] ? K[s][19].map(x => x.toString(16).padStart(2, '0')).join(' ') : '?'}`);
}

// 5. keys[22] 相关：检查 basearr 中是否有 keys22 加密段
console.log('\n=== keys[22] ===');
for (let s = 0; s < 3; s++) {
  const k22 = K[s][22];
  console.log(`S${s + 1} keys22 len=${k22 ? k22.length : '?'}: ${k22 ? k22.map(x => x.toString(16).padStart(2, '0')).join(' ').substring(0, 120) : '?'}`);
}

// 6. basearr 后半段（69+）是否含 keys 派生
console.log('\n=== basearr[69-90] 对比 ===');
for (let s = 0; s < 3; s++) {
  console.log(`S${s + 1}: ${B[s].slice(69, 91).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
}
