const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// dynCode 结构：IIFE 内 6 个 dispatcher 对应 aebi[0..5]
// _\$_s[0] @104175, _\$_s[1] @225312, _\$_s[2] @299620, _\$_s[3] @372247, _\$_s[4] @384561, _\$_s[5] @385712
// IIFE 入口 (function(_$l9,_$_s){...})($_ts.scj,$_ts.aebi)
// 找 IIFE 内第一个执行语句：dispatcher 之间如何连接
// 搜索 '_\$bX(' 调用（_\$bX 是初始化函数 @7448）
console.log('=== _\$bX 调用 ===');
let idx = 0; const calls = [];
while ((idx = code.indexOf('_$bX(', idx + 1)) !== -1 && calls.length < 10) calls.push(idx);
console.log(calls.join(','));
for (const i of calls) console.log('@' + i + ':', code.substring(Math.max(0, i - 100), i + 100));

// 找 dispatcher _\$_s[0] 开头：opcode 0-3 是关键（_\$lf 未初始化）
// 关键：dispatcher 初始化 _\$lf 的 opcode 267 是否在前面
console.log('\n=== _\$lf=[] 前后 ===');
const lfIdx = code.indexOf('_$lf=[]');
console.log('@', lfIdx);
if (lfIdx >= 0) console.log(code.substring(lfIdx - 300, lfIdx + 100));

// 找 _\$eF 的所有赋值（可能多个 dispatcher 赋值）
idx = 0; const efs = [];
while ((idx = code.indexOf('_$eF=', idx + 1)) !== -1 && efs.length < 10) efs.push(idx);
console.log('\n_$eF= 赋值:', efs.join(','));
