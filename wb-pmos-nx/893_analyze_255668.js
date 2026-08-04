/**
 * 893_analyze_255668.js
 * 精确分析错误位置 @255668（reading '88'）
 * 关键：错误行的上下文
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 错误在 @255668，读取上下文
console.log('=== @255668 上下文（前 300 + 后 300） ===');
console.log(body.substring(255368, 255968));
console.log();

// 找该位置的 opcode 处理
// 错误 reading '88' 是 _\$oU[88]（_$oU undefined）
// 但 _\$oU 在捕获时是 defined（oU=defined）
// 可能：_\$oU 在 VM 执行中被覆盖为 undefined
// 检查 @255668 前最近的 _\$oU 赋值
console.log('=== @255668 前 _\$oU 赋值 ===');
const before = body.substring(0, 255668);
let idx = 0;
const assign = [];
while ((idx = before.indexOf('_\$oU=', idx)) >= 0) {
  assign.push({ pos: idx, ctx: before.substring(idx - 20, idx + 40).replace(/\n/g, ' ') });
  idx += 4;
}
console.log('_\$oU= 赋值数:', assign.length);
assign.slice(-5).forEach(a => console.log('@' + a.pos + ': ' + a.ctx));

// 检查 @255668 具体是哪个表达式
console.log('\n=== @255668 精确位置 ===');
console.log(body.substring(255660, 255690));