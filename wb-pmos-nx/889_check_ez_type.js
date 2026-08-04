/**
 * 889_check_ez_type.js
 * 检查 _\$ez 的类型（字符串 vs 数组）
 * 关键：_\$fN 需要字符串（charCodeAt），但 _\$ez 被设置成数组
 * _\$ez 应该是编码的程序字符串（或被解码）
 */
const fs = require('fs');
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));

// 检查 _\$ez 捕获值
const ez = tables['_$ez'];
console.log('_\$ez 类型:', ez.type);
console.log('_\$ez len:', ez.len);
console.log('_\$ez val 前 30:', JSON.stringify(ez.val.slice(0, 30)));

// 检查 _\$ez 值是否像字符串（包含大量 0-255 数字）
const ezVal = ez.val;
const isNumbers = ezVal.every(v => typeof v === 'number');
console.log('_\$ez 全为数字:', isNumbers);
const isStrings = ezVal.every(v => typeof v === 'string');
console.log('_\$ez 全为字符串:', isStrings);

// 如果 _\$ez 是字符串，Array.from(string) 产生字符数组
// 但捕获显示数字 → 说明 _\$ez 是数组（或 Array.from 的数字）
// 检查 _\$ez 值域
if (isNumbers) {
  console.log('_\$ez 值域:', Math.min(...ezVal), '-', Math.max(...ezVal));
  // 如果值域超出 255，是 opcode 程序
  // 如果 0-255，可能是字符串 charCode
  // 检查是否像 base64 解码（0-127）
  console.log('_\$ez 中 >127 的值数:', ezVal.filter(v => v > 127).length);
}

// 关键：_\$fN 需要字符串
// 但 _\$nP(_\$ez) 传 _\$ez
// 如果 _\$ez 是数组，_\$fN 报错
// 浏览器中 _\$ez 是什么？
// 检查 _\$ez 在 _\$c4 中的来源
// _\$c4(_\$cg,_\$ez,...) 的 _\$ez 参数
// 从 IIFE _\$lP 映射
console.log('\n=== _\$ez 在 _\$c4 的来源 ===');
// _\$c4 被 trampoline 调用（_$c4.apply(this, _$a5)）
// _$a5 = [opcode, ...args]
// 所以 _\$ez 实际是 _\$c4 的第 2 参数
// 但 trampoline 只传 opcode 和调用参数
// 主调用 _\$c4(0, _\$ez, ...) 何时有 _\$ez？
// 检查 _\$c4 主调用
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');
// 找 _\$c4 的调用（含 _\$ez 参数）
const c4Calls = [];
let idx = 0;
while ((idx = body.indexOf('_\$c4(', idx)) >= 0) {
  const ctx = body.substring(idx, idx + 60).replace(/\n/g, ' ');
  if (ctx.includes('_$ez') || ctx.includes('_$lP')) {
    c4Calls.push({ pos: idx, ctx: ctx.substring(0, 50) });
  }
  idx += 4;
}
console.log('_\$c4 调用含 _\$ez/_$lP:', c4Calls.length);
c4Calls.slice(0, 5).forEach(c => console.log('@' + c.pos + ': ' + c.ctx));