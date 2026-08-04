/**
 * 842_analyze_error.js
 * 分析 IIFE 顶层错误位置 @255668
 * 关键：错误在 IIFE 顶层（VM 初始化），读 _$a2[_\$oU[88]]
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 检查 _\$oU 表里 88 的值
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
const oU = tables['_$oU'].val;
console.log('_\$oU[88] =', JSON.stringify(oU[88]));
console.log('_\$oU[88] 类型:', typeof oU[88]);
console.log();

// 检查 IIFE @255668 上下文
console.log('=== IIFE @255668 上下文（前 500 + 后 500） ===');
console.log(body.substring(255168, 256168));
console.log();

// 找 _\$a2 在 @255668 前的赋值
const before = body.substring(0, 255668);
// 找最后一个 _\$a2= 赋值
const a2Assigns = [];
let idx = 0;
while ((idx = before.indexOf('_\$a2=', idx)) >= 0) {
  a2Assigns.push({ pos: idx, ctx: before.substring(idx - 20, idx + 40).replace(/\n/g, ' ') });
  idx += 4;
}
console.log('=== _\$a2 赋值（@255668 前） ===');
a2Assigns.slice(-5).forEach(a => console.log('@' + a.pos + ': ' + a.ctx));

// 检查 _\$a2 是否在 @255668 前被赋值
console.log();
console.log('_\$a2 赋值数（@255668 前）:', a2Assigns.length);
console.log('最后一个 _\$a2 赋值 @', a2Assigns.length ? a2Assigns[a2Assigns.length - 1].pos : '无');