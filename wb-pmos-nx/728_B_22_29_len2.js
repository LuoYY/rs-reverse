/**
 * 728_B_22_29_len2.js
 * base[22:29] 7B 分析：
 * [22:26] 4B 每样本不同，[26:29] 有 233,88,0 或 250,0,163 两种模式
 * 检查是否编码 base[68:] 长度或其他信息
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== base[22:29] vs base 长度 ===');
for (const s of samples) {
  const b = s.base;
  console.log(`nsd=${s.nsd}: [22:29]=${b.slice(22, 29).join(',')} baseLen=${b.length} tail68=${b.length - 68} tail88=${b.length - 88}`);
}

// [22:26] 可能是 huffman 编码的某个长度值？
// nxEncrypt 输出的字节，解码回来看是否是长度
// 或者 [22:26] = 明文basearr[某] 的编码

// 检查 [26:29]=233,88,0 vs 250,0,163 与什么相关
console.log('\n=== [26:29] 模式 vs keys2 ===');
for (const s of samples) {
  const mode = s.base.slice(26, 29).join(',');
  console.log(`nsd=${s.nsd}: mode=${mode} keys2[0:8]=${s.keys2.slice(0, 8).join(',')} b86[2:6]=${s.b86.slice(2, 6).join(',')}`);
}

// [22:26] 4B vs base[68:] 前4B 是否有关系
console.log('\n=== base[22:26] vs base[68:72] ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: [22:26]=${s.base.slice(22, 26).join(',')} [68:72]=${s.base.slice(68, 72).join(',')} XOR=${s.base.slice(22, 26).map((v, i) => v ^ s.base[68 + i]).join(',')}`);
}
