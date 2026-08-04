/**
 * 880_analyze_dispatch_chain.js
 * 分析 VM 分发链（IIFE 顶层主循环 + _\$c4）
 * 关键：IIFE 顶层主循环读 _\$lP[0]（aebi[0]，648 全 <444）
 * _\$c4 读 _\$lP[1]（aebi[1]，544 个 <444）
 * 但 opcode 204/227 在 aebi[1]
 * 所以错误在 _\$c4 主循环（读 aebi[1]）
 * _\$c4 的 _\$lP[1] 是 aebi[1]，但 _\$c4 的 _\$pL 参数是计数表？
 * 关键：_$c4 内部 _\$lP 是闭包（IIFE 顶层 var _\$lP）
 * 不！_$c4 是函数，_\$lP 是 IIFE 参数（闭包）
 * 所以 _\$c4 内 _\$lP[1] = aebi[1]（正确）
 * 但 opcode 725 读 _\$oU=_$kB[0]，_$kB=_$pL[0]
 * _\$pL 是 _\$c4 参数（第 3 个）
 * 但 _\$c4 调用时 _\$pL 传什么？
 * 主循环 _\$c4(0) 主调用时 _\$pL = ?
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// 找 _\$c4 主调用（IIFE 顶层）
// 主循环在 @168022，_\$c4 调用在 IIFE 顶层（opcode 分发里）
// 但 opcode 282/284 调用 _\$c1，_\$c1 调用 _\$c4
// 找 _\$c1(0) 和 _\$c1(5) 的调用
console.log('=== _\$c1 调用 ===');
let i = 0;
while ((i = body.indexOf('_\$c1(', i)) >= 0) {
  const ctx = body.substring(i, i + 40).replace(/\n/g, ' ');
  console.log('@' + i + ': ' + ctx.substring(0, 40));
  i += 4;
  if (i > 300000) break;
}

// 找 _\$c4 的完整调用（7 参数）
console.log('\n=== _\$c4 完整调用（7 参数） ===');
// 主调用 _\$c4(0, ...) 或 _\$c4(lP[0], ...)
// 找 _\$c4( 后跟 7 参数的
i = 0;
while ((i = body.indexOf('_\$c4(', i)) >= 0) {
  const ctx = body.substring(i, i + 100).replace(/\n/g, ' ');
  // 数逗号
  const commas = (ctx.match(/,/g) || []).length;
  if (commas >= 3) {
    console.log('@' + i + ': ' + ctx.substring(0, 80));
  }
  i += 4;
  if (i > 400000) break;
}

// 检查 IIFE 顶层主循环如何调用 _\$c4
console.log('\n=== IIFE 顶层主循环调用 _\$c4 ===');
// 主循环 @168022 的 opcode 分发
// 找该循环中的 _\$c4( 调用
const mainLoop = body.substring(168022, 168022 + 50000);
i = 0;
while ((i = mainLoop.indexOf('_\$c4(', i)) >= 0) {
  const ctx = mainLoop.substring(i, i + 80).replace(/\n/g, ' ');
  console.log('@' + (168022 + i) + ': ' + ctx.substring(0, 60));
  i += 4;
}