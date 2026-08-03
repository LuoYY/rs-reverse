/** 491 分析 44815 位置 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
const pos = 44815;
console.log('=== 前后 400 ===');
console.log(code.substring(pos - 400, pos + 100));
