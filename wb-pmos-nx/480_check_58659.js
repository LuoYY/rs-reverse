/** 480 分析 58659 位置 + 所在函数 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
const pos = 58659;
console.log('=== 前后 300 ===');
console.log(code.substring(pos - 300, pos + 100));
// 找所在函数
const fnIdx = code.lastIndexOf('function ', pos);
console.log('\n=== 所在函数 @' + fnIdx + ' ===');
console.log(code.substring(fnIdx, fnIdx + 200));
