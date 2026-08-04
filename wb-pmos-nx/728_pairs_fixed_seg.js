/**
 * 728_pairs_fixed_seg.js
 * 1. base[29:68] 固定段是否 = 环境检测值编码（ASCII 特征？）
 * 2. base 会话变段 [22:29] 的规律
 * 3. 对比 base 与明文 basearr 的整体长度关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

const s0 = samples[0];
// 固定段 29-67
console.log('=== base[29:68] 固定段 ===');
console.log(s0.base.slice(29, 68).join(','));
console.log('长度:', 68 - 29);

// 固定段 ASCII 解读
console.log('\nASCII:', s0.base.slice(29, 68).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));

// 固定头 ASCII
console.log('头 ASCII:', s0.base.slice(0, 22).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));

// base[22:29] 会话变段分析
console.log('\n=== base[22:29] 与 b86 的关系 ===');
for (const s of samples) {
  // b86[2:9] 明文 basearr 开头
  console.log(`nsd=${s.nsd}: base[22:29]=${s.base.slice(22, 29).join(',')} b86[2:9]=${s.b86.slice(2, 9).join(',')}`);
}

// base[22:29] 是否有共同后缀？[26:29]
console.log('\n=== base[26:29] 模式 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: base[26:29]=${s.base.slice(26, 29).join(',')}`);
}

// 固定段是否 = huffman 编码 basearrFull（属性名列表）的部分？
// basearrFull = 170B 属性名列表
try {
  const fd = JSON.parse(fs.readFileSync('/tmp/nx_fixed_dataset.json', 'utf8'));
  if (fd.basearrFull) {
    console.log('\nbasearrFull:', fd.basearrFull.length, 'B', fd.basearrFull.slice(0, 60).map(c => String.fromCharCode(c)).join(''));
  }
} catch (e) { console.log('fixed dataset err:', e.message); }
