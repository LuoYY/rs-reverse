/**
 * 728_B_len_corr.js
 * base 长度与 cd/b86/keys2 的相关性分析
 * base[68:] 长度 97-103
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== base 长度 vs 各特征 ===');
for (const s of samples) {
  const tailLen = s.base.length - 68;
  console.log(`nsd=${s.nsd}: base=${s.base.length} tail68=${tailLen} cd=${s.cd.length} b86=${s.b86.length} b86[0:2]=${s.b86.slice(0, 2).join(',')}`);
}

// b86[0:2] = 明文basearr长度? b86[0]*256+b86[1] = ?
console.log('\n=== b86 头 2 字节含义 ===');
for (const s of samples) {
  const v = (s.b86[0] << 8) | s.b86[1];
  console.log(`nsd=${s.nsd}: b86[0:2]=${s.b86[0]},${s.b86[1]} → ${v}`);
}

// keys2 是否包含 base 会话段线索
console.log('\n=== keys2 最后 8 字节 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: keys2[40:48]=${s.keys2.slice(40, 48).join(',')}`);
}
