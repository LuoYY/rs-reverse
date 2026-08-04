/**
 * 859_vm_provide_kb.js
 * 提供 _\$kB 表（opcode 725 需要 _\$kB[0]）
 * 关键：_\$kB 由 opcode 10 赋值（_$kB=_$pL[0]），或 opcode 36（_$kB=_$ne(_$gc)）
 * 需捕获 _\$kB 或让 VM 正确生成
 * 但 VM 生成 _\$kB 依赖 _\$gc（另一个参数）
 * 检查 _\$c4 的 7 参数：_$cg,_$ez,_$pL,_$gc,_$pb,_$nx,_$cQ
 * 输入 aebi 是 6 个数组，但 _\$c4 要 7 参数
 * 缺 _\$cQ 或 _\$gc？
 */
const fs = require('fs');
const vm = require('vm');

// 读取原始 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 检查 _\$c4 的调用（VM 初始化）
console.log('=== _\$c4 调用 ===');
// 找 vm 里 _\$c4( 调用
let idx = 0;
while ((idx = body.indexOf('_\$c4(', idx)) >= 0) {
  const ctx = body.substring(idx, idx + 120).replace(/\n/g, ' ');
  console.log('@' + idx + ': ' + ctx.substring(0, 100));
  idx += 4;
  if (idx > 400000) break;
}

// 检查输入 aebi 结构
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
console.log('\n=== 输入 aebi 结构 ===');
console.log('aebi 数组数:', inputs.aebi.length);
inputs.aebi.forEach((a, i) => {
  console.log('aebi[' + i + ']: len=' + a.length + ' 前10=' + a.slice(0, 10).join(','));
});

// 检查 _\$c4 如何接收参数
console.log('\n=== _\$c4 参数 ===');
// _\$c4 是 225KB 函数，参数在开头
const c4Idx = body.indexOf('function _$c4');
console.log('_\$c4 开头:', body.substring(c4Idx, c4Idx + 100));