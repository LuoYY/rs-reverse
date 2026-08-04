/**
 * 871_analyze_vm_input.js
 * 分析 VM 输入（aebi）与 _\$c4 参数的关系
 * 关键：IIFE 调用 (globalThis.$_ts.scj, globalThis.$_ts.aebi)
 * scj = _\$lP[0]? aebi = _\$lP[1]?
 * 但 _\$c4 参数是 _\$cg,_\$ez,_\$pL,_\$gc,_\$pb,_\$nx,_\$cQ
 * 而 aebi 是 6 数组
 * 需理解 aebi 如何映射到 _\$c4 参数
 */
const fs = require('fs');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

console.log('=== 输入 aebi ===');
inputs.aebi.forEach((a, i) => {
  console.log('aebi[' + i + ']: len=' + a.length + ' 前10=' + a.slice(0, 10).join(','));
});

console.log('\n=== scj ===');
console.log('scj:', JSON.stringify(inputs.scj).substring(0, 200));

// 检查 IIFE 如何用 scj/aebi
console.log('\n=== IIFE 参数使用 ===');
// IIFE: (function(_$$5,_$lP){...})(globalThis.$_ts.scj, globalThis.$_ts.aebi)
// _$$5 = scj, _$lP = aebi
// 但 _\$c4 是 _\$lP 参数？
// 找 _\$lP 的使用
const lPUse = body.match(/\$lP\[(\d+)\]/g);
console.log('_\$lP 引用:', lPUse ? lPUse.slice(0, 20).join(', ') : '无');

// 找 _\$c4 的调用（VM 启动）
console.log('\n=== _\$c4 主调用 ===');
// trampoline 是 _\$c4(opcode, ...)
// 主调用在 IIFE 顶层
// 找 _\$c4( 调用（非 trampoline 内）
const c4Calls = [];
let idx = 0;
while ((idx = body.indexOf('_\$c4(', idx)) >= 0) {
  const ctx = body.substring(idx, idx + 80).replace(/\n/g, ' ');
  c4Calls.push({ pos: idx, ctx: ctx.substring(0, 60) });
  idx += 4;
}
console.log('_\$c4 调用数:', c4Calls.length);
// 找主调用（参数多）
c4Calls.slice(-10).forEach(c => {
  console.log('@' + c.pos + ': ' + c.ctx);
});

// 检查 _\$c4 的完整参数（主调用）
console.log('\n=== 找 _\$c4 主调用（7 参数） ===');
// 主调用 _\$c4(0, _\$ez, _\$pL, _\$gc, _\$pb, _\$nx, _\$cQ)
// 用 _\$c4(_\$lP[0] 或类似
const mainCall = body.match(/_\\\$c4\\(\\\$lP\\[0\\][^)]*\)/);
console.log('主调用:', mainCall ? mainCall[0].substring(0, 100) : '未找到');