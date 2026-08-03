/**
 * 536_parse_segments.js
 * 离线解析 basearr 段结构 + 动态段与 keys 关系
 */
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));
console.log('会话数:', data.length);

// 打印完整 basearr + keys 摘要
for (let i = 0; i < data.length; i++) {
  const d = data[i];
  const b = d.basearr;
  console.log(`\nS${i + 1} nsd=${d.nsd} basearr len=${b.length}`);
  console.log('basearr:', b.map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('动态[24-30]:', b.slice(24, 31).map(x => x.toString(16).padStart(2, '0')).join(' '));
  // keys 摘要：每个 keys[i] 的 hex
  const ks = d.keys;
  console.log('keys 数量:', ks.length);
  // 打印 keys[2], keys[16], keys[17], keys[19], keys[24], keys[33], keys[34]
  for (const ki of [2, 16, 17, 19, 24, 33, 34]) {
    if (ks[ki]) console.log(`  keys[${ki}]: ${ks[ki].map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  }
}

// 段标记扫描（len243.js 段标记：3,10,7,0,6,2,9,13）
console.log('\n=== 段标记扫描 ===');
const segMarkers = [3, 10, 7, 0, 6, 2, 9, 13];
for (let i = 0; i < data.length; i++) {
  const b = data[i].basearr;
  console.log(`S${i + 1} 段标记位置:`);
  for (const m of segMarkers) {
    const positions = [];
    for (let p = 0; p < b.length; p++) if (b[p] === m) positions.push(p);
    if (positions.length) console.log(`  ${m}: ${positions.join(',')}`);
  }
}

// 动态段与 keys 关系（S1/S2 对比）
console.log('\n=== 动态段 vs keys ===');
if (data.length >= 2) {
  const dyn1 = data[0].basearr.slice(24, 30);
  const dyn2 = data[1].basearr.slice(24, 30);
  console.log('S1 动态:', dyn1.map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('S2 动态:', dyn2.map(x => x.toString(16).padStart(2, '0')).join(' '));
  // 动态段差异 = keys 差异?
  for (let ki = 0; ki < data[0].keys.length; ki++) {
    const k1 = data[0].keys[ki], k2 = data[1].keys[ki];
    if (!k1 || !k2 || k1.length !== k2.length) continue;
    // 找与动态段差相关的 keys 字节
    for (let bi = 0; bi < 6; bi++) {
      const dv = (dyn2[bi] - dyn1[bi] + 256) & 255;
      for (let kj = 0; kj < k1.length; kj++) {
        const kv = (k2[kj] - k1[kj] + 256) & 255;
        if (dv === kv && dv !== 0) console.log(`  ★ 动态[${24 + bi}]差=${dv.toString(16)} = keys[${ki}][${kj}]差`);
      }
    }
  }
}
