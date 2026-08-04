/**
 * 728_B_68_92_deep.js
 * base[68:92] 24 字节深度分析
 * 1. 每位置跨会话值分布
 * 2. 是否含固定段+变化段
 * 3. 与 b86 的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;
const NORMAL = samples.filter(s => s.base[26] === 233);
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;

console.log('=== base[68:92] 每位置跨会话值（6 标准会话） ===');
for (let i = 0; i < 24; i++) {
  const vals = NORMAL.map(s => s.base[68 + i]);
  const uniq = new Set(vals);
  console.log(`[${68 + i}]: ${vals.join(',')} | ${uniq.size}种`);
}

// 用 pairs 数据（含 b86）补充分析
console.log('\n=== pairs 样本 base[68:92] ===');
for (const s of pairs.slice(0, 3)) {
  console.log(`nsd=${s.nsd}: ${s.base.slice(68, 92).join(',')}`);
}

// 检查 base[68:92] 是否与 b86 的 keys 段解密后相关
// 用 pairs 的 keys2 对比
console.log('\n=== pairs base[68:92] XOR keys2 ===');
for (const s of pairs.slice(0, 3)) {
  const seg = s.base.slice(68, 92);
  const x = seg.map((v, i) => v ^ s.keys2[i]);
  console.log(`nsd=${s.nsd}: ${x.join(',')}`);
}

// 检查 base[68:92] 是否含时间戳（Unix 秒）
console.log('\n=== base[68:92] 是否含时间戳 ===');
for (const s of NORMAL) {
  const seg = s.base.slice(68, 92);
  // 尝试每 4 字节作为 32 位整数
  const asInt = [];
  for (let i = 0; i + 4 <= 24; i += 4) {
    const v = ((seg[i] << 24) >>> 0) + (seg[i + 1] << 16) + (seg[i + 2] << 8) + seg[i + 3];
    asInt.push(v);
  }
  console.log(`nsd=${s.nsd}: 32位整数=${asInt.join(',')} 当前时间=${Math.floor(Date.now() / 1000)}`);
}
