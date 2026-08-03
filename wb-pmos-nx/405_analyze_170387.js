/**
 * 405_analyze_170387.js
 * 分析插桩后代码 170387 位置（报错点）→ 找 documentMode 访问
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_patch69b.js', 'utf8');

const pos = 170387;
console.log('=== 170387 前后 300 ===');
console.log(code.substring(pos - 300, pos + 200).replace(/\n/g, ' '));

// 找该位置所属函数边界
console.log('\n=== 往前找 function 边界 ===');
const before = code.substring(165000, pos);
let lastF = before.lastIndexOf('function');
console.log('最近 function @', 165000 + lastF);
console.log(code.substring(165000 + lastF, 165000 + lastF + 150).replace(/\n/g, ' '));
