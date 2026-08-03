/**
 * 389_analyze_170543.js
 * 离线分析：170543 位置精确代码 + 'documentMode' 字符串在动态代码中的位置
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_envfull.js', 'utf8');

console.log('=== 170543 前后 600 字符 ===');
console.log(code.substring(170000, 171200).replace(/\n/g, ' '));

console.log('\n=== "documentMode" 字面量位置 ===');
let idx = 0, count = 0;
while ((idx = code.indexOf('documentMode', idx)) !== -1) {
  count++;
  console.log(`#${count} @${idx}:`, code.substring(Math.max(0, idx - 100), idx + 60).replace(/\n/g, ' '));
  idx += 13;
}
console.log('总数:', count);

// 环境索引数组（包含属性名的数组）——找含 documentMode 的数组
console.log('\n=== 含 documentMode 的数组 ===');
const arrM = code.match(/\[[^\]]*documentMode[^\]]*\]/g);
console.log(arrM ? arrM.slice(0, 3).map(a => a.substring(0, 150)) : '无');
