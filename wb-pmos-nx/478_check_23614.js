/** 478 查看 @23614 4 参数函数 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');
const pos = 23614;
console.log('=== @23614 前 100 ===');
console.log(code.substring(pos - 100, pos));
console.log('=== @23614 后 400 ===');
console.log(code.substring(pos, pos + 400));
