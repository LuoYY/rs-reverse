/** 469 分析 92193 位置（'76' 报错） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
const pos = 92193;
console.log('=== 前后 500 ===');
console.log(code.substring(pos - 500, pos + 100));
