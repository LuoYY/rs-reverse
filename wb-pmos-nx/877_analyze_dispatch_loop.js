/**
 * 877_analyze_dispatch_loop.js
 * 分析主分发循环（_$c4 的 while(1)）
 * 关键：@168099 的 _$lP[0] 是主分发循环（_$jc=_$ib[_$oL++]）
 * 这是 VM 主解释器（_$c4 或类似）
 * 检查它的参数和程序流
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// @168099 附近是主分发循环
console.log('=== @168099 主分发循环 ===');
console.log(body.substring(168099, 168500));
console.log();

// 找该循环所在函数
const fnStart = body.lastIndexOf('function', 168099);
console.log('所在函数 @', fnStart);
const fnMatch = body.substring(fnStart, fnStart + 60).match(/function (_\$\w+)/);
console.log('函数名:', fnMatch ? fnMatch[1] : '?');
console.log('函数开头:', body.substring(fnStart, fnStart + 100));

// 检查该函数参数
console.log('\n=== 函数参数 ===');
console.log(body.substring(fnStart, fnStart + 150));

// 检查 _\$lP 使用
console.log('\n=== _\$lP 使用 ===');
const fnBody = body.substring(fnStart, Math.min(fnStart + 200000, body.length));
const m = fnBody.match(/\$lP\[(\d+)\]/g);
console.log('_\$lP 引用:', m ? m.join(', ') : '无');

// 检查 _\$ib 和 _\$oL（主循环的 opcode 流）
console.log('\n=== 主循环变量 ===');
const ib = fnBody.indexOf('_\$ib');
console.log('_\$ib @', ib);
const oL = fnBody.indexOf('_\$oL');
console.log('_\$oL @', oL);