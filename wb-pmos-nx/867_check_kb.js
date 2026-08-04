/**
 * 867_check_kb.js
 * 检查 _\$kB 应是什么值（_$pL[0] 或 _\$gc 相关）
 * 关键：opcode 10 设 _\$kB=_$pL[0]，opcode 36 设 _\$kB=_$ne(_$gc)
 * 检查捕获的 _\$pL 和 _\$k0
 */
const fs = require('fs');
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));

console.log('=== 捕获的 _\$pL ===');
console.log('_\$pL:', JSON.stringify(tables['_$pL'].val).substring(0, 200));
console.log('_\$pL len:', tables['_$pL'].val.length);

console.log('\n=== 捕获的 _\$k0 ===');
console.log('_\$k0 len:', tables['_$k0'].val.length);
console.log('_\$k0 前 30:', tables['_$k0'].val.slice(0, 30).join(','));

console.log('\n=== 捕获的 _\$cg ===');
if (tables['_$cg']) console.log('_\$cg:', JSON.stringify(tables['_$cg'].val).substring(0, 200));
else console.log('_\$cg 未捕获');

console.log('\n=== 捕获的 _\$ez ===');
if (tables['_$ez']) console.log('_\$ez len:', tables['_$ez'].val.length, '前 20:', tables['_$ez'].val.slice(0, 20).join(','));
else console.log('_\$ez 未捕获');

// 检查 _\$pL[0] 的值
console.log('\n=== _\$pL[0] ===');
console.log('_\$pL[0]:', tables['_$pL'].val[0]);

// 关键：opcode 725 是 _\$oU=_$kB[0]
// 如果 _\$kB = _\$pL[0] = 某个值，_\$kB[0] = 该值[0]
// 如果 _\$pL[0] 是数组，_\$kB[0] = 数组[0]
console.log('\n=== _\$pL[0] 类型 ===');
console.log('typeof _\$pL[0]:', typeof tables['_$pL'].val[0]);