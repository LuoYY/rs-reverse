// 找 _$aI 的父函数 + 检查父函数是否有局部池遮蔽
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const aI = c.indexOf('function _$aI(');
console.log('_$aI @' + aI);
// 向前找最近的 function 定义（在 148554 之前的 function X( 模式）
const before = c.slice(0, aI);
// 找所有函数定义位置
const fns = [];
let i = 0;
while ((i = before.indexOf('function ', i)) >= 0) {
  fns.push(i);
  i += 9;
}
console.log('前方函数数:', fns.length, '最后一个 @' + fns[fns.length - 1]);
const last = fns[fns.length - 1];
console.log('父函数:', c.slice(last, last + 60));
// 父函数的 var 声明
const parentBody = c.slice(last, aI + 1000);
const vars = parentBody.match(/var ([_$a-zA-Z0-9]+)/g);
console.log('父函数 var 声明:', vars ? vars.join(',') : '无');
// 检查父函数是否有局部 _$lC 等
const lcInParent = parentBody.indexOf('_$lC');
console.log('父函数含 _$lC:', lcInParent >= 0);
// 找父函数的完整范围
let depth = 0, end = -1;
for (let j = last; j < c.length; j++) {
  if (c[j] === '{') depth++;
  else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
}
console.log('父函数结束 @' + end + ' (长度 ' + (end - last) + ')');
console.log('_$aI 在父函数内?', aI > last && aI < end);
console.log('父函数体前 500:', c.slice(last, last + 500));
