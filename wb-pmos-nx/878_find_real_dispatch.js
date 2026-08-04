/**
 * 878_find_real_dispatch.js
 * 定位真正的主分发函数（含 _$lP[0] 主循环的）
 * 关键：@167006 的 _$dT 是 trampoline（_$kZ(_$lC[139])）
 * 真正的函数在 @168022（含 _$lP[0] 主循环）
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 主循环 @168099，但所在函数是 @168022（_$lP[0] 前）
// 找 @168022 是什么
const realStart = 168022;
console.log('=== @168022 上下文 ===');
console.log(body.substring(168022, 168200));
console.log();

// 找 @168022 的最近函数
const fnStart = body.lastIndexOf('function', 168022);
console.log('最近函数 @', fnStart);
console.log(body.substring(fnStart, fnStart + 100));

// 检查该函数是否含主循环
let depth = 0, end = fnStart;
for (let i = fnStart; i < body.length; i++) {
  if (body[i] === '{') depth++;
  else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnBody = body.substring(fnStart, end);
console.log('函数范围: [' + fnStart + '-' + end + '] size=' + (end - fnStart));
console.log('含主循环 while(1):', fnBody.includes('while(1)'));
console.log('含 _\$lP[0]:', fnBody.includes('_\$lP[0]'));
console.log('含 _\$lP[1]:', fnBody.includes('_\$lP[1]'));

// 检查该函数的参数
console.log('\n=== 函数参数 ===');
console.log(body.substring(fnStart, fnStart + 150));