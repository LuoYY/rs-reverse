/**
 * 728_pairs_check_pos.js
 * 分析 team-lead 的校验位置：
 * 412 校验: [28],[32],[56],[60-66],[82],[92-98],[102],[112],[116],[142-144],[148-154],[160-162]
 * 400 长度: [48],[50],[88],[90]
 * 检查这些位置的实际值（是否固定/跨会话）
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

const CHECK412 = [28, 32, 56, 60, 61, 62, 63, 64, 65, 66, 82, 92, 93, 94, 95, 96, 97, 98, 102, 112, 116, 142, 143, 144, 148, 149, 150, 151, 152, 153, 154, 160, 161, 162];
const CHECK400 = [48, 50, 88, 90];

console.log('=== 412 校验位置值（跨10样本） ===');
for (const p of CHECK412) {
  const vals = samples.map(s => s.base[p] !== undefined ? s.base[p] : '-');
  const uniq = new Set(vals);
  console.log(`[${p}]: ${vals.join(',')} | ${uniq.size}种`);
}

console.log('\n=== 400 长度字段位置值 ===');
for (const p of CHECK400) {
  const vals = samples.map(s => s.base[p]);
  console.log(`[${p}]: ${vals.join(',')}`);
}

// 位置 48/50 与长度的关系
console.log('\n=== base 长度 vs [48],[50] ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: base len=${s.base.length} [48]=${s.base[48]} [50]=${s.base[50]} [88]=${s.base[88]} [90]=${s.base[90]}`);
}
