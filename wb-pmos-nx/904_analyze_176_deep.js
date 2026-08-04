/**
 * 904_analyze_176_deep.js
 * 深入分析 reading '176' 错误
 * 关键：错误在 @258171，但代码里 [176] 访问是 _\$oU[176] 等
 * 检查 _\$oU[176] 的值（应为字符串）
 * 但 _\$oU 可能是 undefined（被覆盖）
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_fixed3.js', 'utf8');

// 错误 @258171，精确上下文
console.log('=== @258171 精确 ===');
console.log(body.substring(258150, 258200));

// 找该位置的表达式
// 错误 reading '176' → X[176] 其中 X undefined
// 可能 _\$oU[176]（_$oU undefined）或 _\$oP[176] 等
// 检查 @258171 处的表
const seg = body.substring(258100, 258200);
console.log('\n=== 段内容 ===');
console.log(seg);

// 找所有 _\$X[176] 模式（X 是表）
const matches = seg.match(/\$[a-zA-Z0-9_]+\[176\]/g);
console.log('\n[176] 访问:', matches);