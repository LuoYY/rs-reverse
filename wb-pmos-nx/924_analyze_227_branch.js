/**
 * 924_analyze_227_branch.js
 * 分析 opcode 227 分支（debugger;_$$p=_$a2[_$oU[88]]）
 * 关键：opcode 227 在 _\$c4 的 if 分发（_$jc===227）
 * 但 _\$oU 在 _\$c4 内是闭包变量（IIFE 顶层 var）
 * 找到 _\$c4 内 opcode 227 分支的上下文
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 完整 opcode 227 分支
const target = '_$a2[_$oU[88]]';
const tIdx = body.indexOf(target);
console.log('opcode 227 表达式 @', tIdx);
console.log('=== 完整 227 分支上下文 ===');
console.log(body.substring(tIdx - 300, tIdx + 100));
console.log();

// 找 _\$c4 内 var _$oU 声明
// 找 _\$c4 位置
const c4Idx = body.indexOf('function _$c4');
console.log('_\$c4 @', c4Idx);
// _\$c4 内 var 声明
const c4 = body.substring(c4Idx, c4Idx + 300000);
const vars = c4.match(/var\s+_\$\w+/g);
console.log('\n_\$c4 内 var 声明（前 30）:', vars ? vars.slice(0, 30).join(', ') : '无');
// 检查 var _$oU
console.log('_\$c4 内 var _$oU:', c4.includes('var _$oU'));

// 检查 IIFE 顶层 var _$oU
const top = body.substring(0, c4Idx);
console.log('\nIIFE 顶层 var _$oU:', top.includes('var _$oU'));

// 关键：opcode 227 在 _\$c4 内（tIdx > c4Idx?）
console.log('opcode 227 在 _\$c4 内:', tIdx > c4Idx);

// 检查 _\$c4 内 opcode 227 的 _\$oU 来源
// _\$c4 内 _\$oU 是闭包（IIFE 顶层 var）或局部（var）
console.log('\n=== 结论 ===');
if (tIdx > c4Idx) {
  console.log('opcode 227 在 _\$c4 内');
  if (c4.includes('var _$oU')) {
    console.log('_\$c4 内 var _$oU（局部遮蔽）→ opcode 227 用局部 _\$oU');
    console.log('但局部 _\$oU 未初始化（无赋值）→ undefined');
  } else {
    console.log('_\$c4 内无 var _$oU → opcode 227 用闭包 _\$oU（IIFE 顶层）');
    console.log('IIFE 顶层注入 var _$oU 应生效');
  }
} else {
  console.log('opcode 227 在 IIFE 顶层（非 _\$c4）');
}