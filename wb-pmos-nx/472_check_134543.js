/** 472 分析 134543 位置 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
const pos = 134543;
console.log('=== 前后 400 ===');
console.log(code.substring(pos - 400, pos + 100));
console.log('\n=== 精确 ===');
console.log(JSON.stringify(code.substring(pos - 20, pos + 20)));
