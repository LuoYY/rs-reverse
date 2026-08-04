/**
 * 865_find_real_gq.js
 * 定位真正的 _$gq 函数（含 opcode 10/725 的大函数）
 * 关键：@133052 的 _$gq 是 trampoline（39B），真正的在 @295854
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// @295854 是 opcode 725 所在函数
const fnStart = 295854;
let depth = 0, end = fnStart;
for (let i = fnStart; i < body.length; i++) {
  if (body[i] === '{') depth++;
  else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
console.log('@295854 函数范围: [' + fnStart + '-' + end + '] size=' + (end - fnStart));
console.log('函数开头:', body.substring(fnStart, fnStart + 100));
// 找函数名
const fnMatch = body.substring(Math.max(0, fnStart - 200), fnStart).match(/function (_\$\w+)/);
console.log('函数名:', fnMatch ? fnMatch[1] : '?');

// 检查该函数参数
console.log('\n=== 函数参数 ===');
console.log(body.substring(fnStart, fnStart + 150));

// 检查 _\$lP 引用
console.log('\n=== _\$lP 引用 ===');
const fnBody = body.substring(fnStart, end);
const m = fnBody.match(/\$lP\[(\d+)\]/g);
console.log('_\$lP 引用:', m ? m.join(', ') : '无');

// 检查 _\$kB 初始化和使用
console.log('\n=== _\$kB 在函数中 ===');
let idx = 0;
while ((idx = fnBody.indexOf('_\$kB', idx)) >= 0) {
  console.log('@' + (fnStart + idx) + ': ' + fnBody.substring(idx - 20, idx + 40).replace(/\n/g, ' '));
  idx += 4;
  if (idx > 10000) break;
}