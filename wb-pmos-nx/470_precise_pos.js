/** 470 精确查看 92193 位置 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
const pos = 92193;
console.log('=== 92193 前后 150 ===');
console.log(code.substring(pos - 150, pos + 150));
console.log('\n=== 精确字符 ===');
console.log('char@92193:', JSON.stringify(code[pos]));
console.log('char@92192-92195:', JSON.stringify(code.substring(pos - 3, pos + 5)));
