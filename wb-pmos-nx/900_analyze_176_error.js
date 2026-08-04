/**
 * 900_analyze_176_error.js
 * 分析新错误 reading '176' @258171
 * 关键：_\$oU 锚定后 VM 执行更深入，现在读 _\$oP[176] 或类似
 * 分析 176 错误的表达式
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_fixed2.js', 'utf8');

// 错误 @258171
console.log('=== @258171 上下文 ===');
console.log(body.substring(258071, 258271));
console.log();

// 找 reading '176' 的表达式
// 可能是 _\$oP[176] 或 _\$oU[176] 或 _\$Something[176]
console.log('=== 176 相关的表访问 ===');
// 找 @258171 附近的
const segment = body.substring(258100, 258200);
console.log(segment);