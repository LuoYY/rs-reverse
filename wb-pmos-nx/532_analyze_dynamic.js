/**
 * 532_analyze_dynamic.js
 * 离线分析 basearr 动态段（24-29）与 keys2/keys17/r2mka/start/t 的关系
 */
const fs = require('fs');
const crypto = require('crypto');

const data = JSON.parse(fs.readFileSync('/tmp/basearr_dataset.json', 'utf8'));
console.log('会话数:', data.length);
for (let i = 0; i < data.length; i++) {
  const d = data[i];
  console.log(`S${i + 1} nsd=${d.nsd}`);
  console.log(`  动态[24-29]: ${d.basearr.slice(24, 30).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`  keys2[0-16]: ${d.keys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`  keys17[0-16]: ${d.keys17.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`  r2mka: ${d.r2mka.map(b => b.toString(16).padStart(2, '0')).join(' ')} start: ${d.start.map(b => b.toString(16).padStart(2, '0')).join(' ')} t: ${d.t}`);
}

// 相关性分析：动态段与 keys 各字节
if (data.length >= 2) {
  const dyn = data.map(d => d.basearr.slice(24, 30));
  const k2 = data.map(d => d.keys2);
  const k17 = data.map(d => d.keys17);
  console.log('\n=== 动态段 vs keys2/keys17 字节相关性 ===');
  // 对每个动态段字节位置 p，找 keys2/keys17 的对应
  for (let p = 0; p < 6; p++) {
    const dv = dyn.map(d => d[p]);
    console.log(`动态[${24 + p}]: ${dv.map(v => v.toString(16).padStart(2, '0')).join(' ')}`);
  }
  // 动态段是否 = keys 某段异或/加
  console.log('\n=== 尝试关系 ===');
  for (let p = 0; p < 6; p++) {
    for (let ki = 0; ki < 16; ki++) {
      // 动态[p] vs keys2[ki]^keys17[ki]?
      const x1 = data.map(d => d.basearr[24 + p] === (d.keys2[ki] ^ d.keys17[ki]));
      const x2 = data.map(d => d.basearr[24 + p] === (d.keys2[ki] + d.keys17[ki] & 255));
      const x3 = data.map(d => d.basearr[24 + p] === d.keys2[ki]);
      const x4 = data.map(d => d.basearr[24 + p] === d.keys17[ki]);
      if (x1.every(v => v)) console.log(`  ★ 动态[${24 + p}] = keys2[${ki}] ^ keys17[${ki}]`);
      if (x2.every(v => v)) console.log(`  ★ 动态[${24 + p}] = (keys2[${ki}] + keys17[${ki}]) & 255`);
      if (x3.every(v => v)) console.log(`  ★ 动态[${24 + p}] = keys2[${ki}]`);
      if (x4.every(v => v)) console.log(`  ★ 动态[${24 + p}] = keys17[${ki}]`);
    }
  }
  // 尝试哈希：动态段 = hash(keys2+keys17)[某段]?
  console.log('\n=== 尝试哈希 ===');
  for (const d of data) {
    const k2s = Buffer.from(d.keys2);
    const k17s = Buffer.from(d.keys17);
    const md5 = crypto.createHash('md5').update(Buffer.concat([k2s, k17s])).digest();
    const md5b = crypto.createHash('md5').update(Buffer.concat([k17s, k2s])).digest();
    const sha1 = crypto.createHash('sha1').update(Buffer.concat([k2s, k17s])).digest();
    console.log(`S: 动态=${d.basearr.slice(24, 30).map(b => b.toString(16).padStart(2, '0')).join(' ')} md5(k2+k17)[0-5]=${md5.slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join(' ')} md5(k17+k2)[0-5]=${md5b.slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join(' ')} sha1[0-5]=${sha1.slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  }
}
