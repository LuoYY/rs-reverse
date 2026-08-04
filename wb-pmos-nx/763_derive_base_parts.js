/**
 * 763_derive_base_parts.js
 * 判断 base[22+] 各段能否用 b86/cd 派生：
 * 1. 固定头[0-21] + 固定段[29-67] 已证跨 nsd 固定 → 硬编码
 * 2. base[22-28] 会话段：跨 cd 是否固定？是否含 cd 派生信息？
 * 3. base[68+] 数据段：与 b86[2+68:] 是否相关？与 keys2 是否相关？
 * 4. 尾部 10B：跨 nsd 固定 → 硬编码
 * 目标：找出 base[22+] 中哪些是 f(cd) 可推导，哪些可任意
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const S = d.samples;

console.log('=== base[22-28] 会话段跨样本 ===');
S.forEach((s, i) => console.log('S' + i + ' nsd=' + s.nsd + ' [22-28]=' + s.base.slice(22, 29).join(',')));
console.log();

// base[22-28] 与 b86[2:9] 的关系
console.log('=== [22-28] vs b86[2:9] ===');
S.forEach((s, i) => {
  const seg = s.base.slice(22, 29);
  const b86 = s.b86.slice(2, 9);
  const xor = seg.map((v, j) => v ^ b86[j]);
  console.log('S' + i + ' seg=' + seg.join(',') + ' b86=' + b86.join(',') + ' xor=' + xor.join(','));
});
console.log();

// base[68+] 数据段：长度和来源分析
console.log('=== base[68:] 长度与值 ===');
S.forEach((s, i) => {
  const tail = s.base.slice(68);
  console.log('S' + i + ' len=' + s.base.length + ' [68:]len=' + tail.length + ' [68-75]=' + tail.slice(0, 8).join(','));
});
console.log();

// 尾部 10B 检查
console.log('=== 尾部 10B 跨样本 ===');
S.forEach((s, i) => console.log('S' + i + ' 尾10=' + s.base.slice(-10).join(',')));
console.log();

// 关键：base[68:] 是否等于 b86[2+68:] 或 b86 某段？
console.log('=== base[68:88] vs b86[2+68:2+88] ===');
S.slice(0, 5).forEach((s, i) => {
  const bPart = s.base.slice(68, 88);
  const b86Part = s.b86.slice(70, 90);
  let match = 0;
  for (let j = 0; j < 20; j++) if (bPart[j] === b86Part[j]) match++;
  console.log('S' + i + ' base[68:88]=' + bPart.join(','));
  console.log('   b86[70:90]=' + b86Part.join(',') + ' match=' + match + '/20');
});
