const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 分析顶层：IIFE 体 (function(_$l9,_$_s){ ... })($_ts.scj,$_ts.aebi)
// 找到 IIFE 结束位置（最后 })($_ts.scj,$_ts.aebi) 之前）
const tail = code.lastIndexOf('})($_ts.scj,$_ts.aebi)');
console.log('IIFE tail @', tail);
// 顶层代码应该是开头定义 + 结尾调用
// 找所有顶层 function 定义（在 IIFE 体内，缩进 0）
// 简单方式：找 _\$bX 和 _\$b1 的包含关系。先看 _\$bX 定义范围
const bX = code.indexOf('function _$bX');
// 找 _$bX 的结束：下一个顶层 function（前面只有空白/分号）
let searchFrom = bX + 10;
let nextFn = -1;
// 用简单括号匹配找 _$bX 函数体结束
let depth = 0, started = false;
for (let i = bX; i < code.length; i++) {
  const c = code[i];
  if (c === '{') { depth++; started = true; }
  else if (c === '}') { depth--; if (started && depth === 0) { nextFn = i; break; } }
}
console.log('_$bX 定义范围:', bX, '→', nextFn, '长度:', nextFn - bX);
console.log('_$bX 内是否有 _$b1 定义:', code.substring(bX, nextFn).includes('function _$b1'));
console.log('_$bX 内 _$b1( 调用:', (code.substring(bX, nextFn).match(/_$b1\(/g) || []).length);

// 找 _$b1 定义
const b1 = code.indexOf('function _$b1');
console.log('\n_$b1 @', b1);
let depth2 = 0, started2 = false, end1 = -1;
for (let i = b1; i < code.length; i++) {
  const c = code[i];
  if (c === '{') { depth2++; started2 = true; }
  else if (c === '}') { depth2--; if (started2 && depth2 === 0) { end1 = i; break; } }
}
console.log('_$b1 定义范围:', b1, '→', end1, '长度:', end1 - b1);
// _$b1 里引用 _$h7 吗
const b1body = code.substring(b1, end1);
console.log('_$b1 内 _$h7 引用:', (b1body.match(/_$h7/g) || []).length);
console.log('_$b1 内 _$h7= 赋值:', (b1body.match(/_$h7=/g) || []).length);

// 顶层 _$h7 赋值（IIFE 体内，非函数内）
// 找 "var _$h7" 和 ",_$h7," 在声明列表
console.log('\nvar _$h7:', code.indexOf('var _$h7'));
console.log(',_$h7,:', code.indexOf(',_$h7,'));
console.log(',_$h7=', code.indexOf(',_$h7='));
// 找 IIFE 体内顶层 _$h7= （跳过函数体：只统计不在 {} 内的）
console.log('\n=== IIFE 开头到第1个 function 之间的顶层代码 ===');
const firstFn = code.indexOf('function');
console.log(code.substring(0, firstFn).substring(0, 800));
