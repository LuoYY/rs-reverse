// 检查 _$c4 函数的 var 声明 + _$aI 定义位置 + 池的作用域
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$c4 定义
const c4 = c.indexOf('function _$c4(');
console.log('_$c4 @' + c4);
// _$c4 函数体的 var 声明（前 2000 字符）
const c4Body = c.slice(c4, c4 + 3000);
const vars = c4Body.match(/var ([_$a-zA-Z0-9]+)[,;=]/g);
console.log('_$c4 开头 var 声明:', vars ? vars.join(' ') : '无');
// 找 _$aI 定义
const aI = c.indexOf('function _$aI(');
console.log('_$aI @' + aI);
// 找 _$aI 是否在 _$c4 内
console.log('_$aI 在 _$c4 内?', aI > c4);
// _$lC 在 dynCode 中的 var 声明
const lcVar = c.indexOf('var _$lC');
console.log('var _$lC @' + lcVar);
// 检查 IIFE 结构（开头）
console.log('IIFE 开头:', c.slice(0, 200));
// 池在 IIFE 内的注入点（我们注入的地方）
// 检查 main loop 的池赋值是否在 _$c4 内
const b1a = c.indexOf('_$b1=_$kB[1]');
console.log('_$b1=_$kB[1] @' + b1a + ' (在 _$c4 内? ' + (b1a > c4) + ')');
// 找 _$c4 的结束位置（函数边界）
let depth = 0, end = -1;
for (let i = c4; i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
console.log('_$c4 结束 @' + end + ' (长度 ' + (end - c4) + ')');
console.log('_$aI 在 _$c4 内?', aI > c4 && aI < end);
console.log('_$b1 赋值在 _$c4 内?', b1a > c4 && b1a < end);
