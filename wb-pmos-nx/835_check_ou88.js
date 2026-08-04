/**
 * 835_check_ou88.js
 * 检查 _\$oU[88] 和 VM 访问的 window 属性
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
const oU = d['_$oU'].val;
const b1 = d['_$b1'].val;
const lc = d['_$lc'].val;

console.log('_\$oU[88] =', JSON.stringify(oU[88]));
console.log('_\$oU[88] 类型:', typeof oU[88]);
console.log();
// 错误里有 _\$oU[88] 和 _\$a2[...]
// 检查 _\$oU 中所有字符串（可能是属性名）
console.log('=== _\$oU 中的关键字符串 ===');
const propNames = oU.filter(s => typeof s === 'string' && s.length > 1 && s.length < 30);
console.log('属性名候选:', propNames.slice(0, 40).join(', '));
console.log();
// 检查 $a2 需要的属性（window 属性）
console.log('=== _\$b1 关键字符串 ===');
console.log('b1:', b1.slice(0, 40).join(', '));
console.log();
console.log('=== _\$lc 关键字符串 ===');
console.log('lc:', lc.slice(0, 40).join(', '));