/**
 * 875_analyze_pL_origin.js
 * 分析 _\$pL 的真实来源
 * 关键：捕获的 _\$pL [0,52,3,0,5,5,7,7] 是计数表
 * 但 aebi[2] 是 2479 长度（程序表）
 * _\$pL 应该是 aebi[2] 或类似
 * 检查 _\$c4 的 _\$pL 参数如何从 aebi 映射
 */
const fs = require('fs');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// _\$c4 定义 @267104（原始）
// 但 IIFE 顶层用 _\$lP

// 检查 _\$lP 与 aebi 的关系
console.log('=== _\$lP = aebi ===');
console.log('aebi 数组数:', inputs.aebi.length);
console.log('_\$lP 引用（_$c4 外）:');

// 找 _\$lP 在 IIFE 顶层的使用
let idx = 0;
while ((idx = body.indexOf('_\$lP[', idx)) >= 0) {
  const ctx = body.substring(idx, idx + 40).replace(/\n/g, ' ');
  console.log('@' + idx + ': ' + ctx.substring(0, 40));
  idx += 5;
  if (idx > 80000) break;
}

// 检查 _\$c4 的 _\$ez/_\$pL 参数
console.log('\n=== _\$c4 内部 _\$pL 使用 ===');
const c4Idx = body.indexOf('function _$c4');
const c4 = body.substring(c4Idx, c4Idx + 300000);
// 找 _\$pL 在 _\$c4 内
const pLUse = c4.match(/\$pL\[(\d+)\]/g);
console.log('_\$c4 内 _\$pL 引用:', pLUse ? pLUse.slice(0, 10).join(', ') : '无');

// 关键：_$c4 的 _\$pL 参数从哪来？
// IIFE 顶层调用 _\$c4(0)? 不，是 _\$c1(0)
// _\$c1 用 _\$lP[4]（aebi[4]）
// _\$c1 程序流 = aebi[4]（38 长度）
// 但 _\$c1 是 VM 启动器，不是 _\$c4
// 真正主分发是 _\$c1 调用的 _\$c4
console.log('\n=== 关键 ===');
console.log('_\$c1 用 _\$lP[4]（aebi[4] 38B）');
console.log('_\$c1 = VM 启动器（opcode 282/284 调用）');
console.log('但 _\$c1 是外层，内层 _\$c4 是主分发');
console.log('_\$c4 的 _\$pL 参数 = aebi[?]');
console.log('需确认 _\$c4 调用时 _\$pL 的映射');

// 检查 _\$c1 如何调用 _\$c4
console.log('\n=== _\$c1 调用 _\$c4 ===');
const c1Idx = body.indexOf('function _$c1');
const c1 = body.substring(c1Idx, c1Idx + 100000);
const c4Calls = c1.match(/_\\\$c4\\([^)]*\)/g);
console.log('_\$c1 内 _\$c4 调用:', c4Calls ? c4Calls.slice(0, 5).join(' ; ') : '无');