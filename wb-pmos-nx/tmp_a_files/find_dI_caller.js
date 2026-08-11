// 找 _$dI(_$aq,'var') 调用点的父函数 + _$dI 依赖的运行时变量
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 找 _$dI( 调用点
const call = c.indexOf("_$dI(_$aq,'var')");
console.log('_$dI(_$aq,"var") @' + call);
// 向前找父函数
if (call >= 0) {
  const before = c.slice(0, call);
  const fns = [];
  let i = 0;
  while ((i = before.indexOf('function ', i)) >= 0) { fns.push(i); i += 9; }
  const last = fns[fns.length - 1];
  console.log('父函数 @' + last + ':', c.slice(last, last + 80));
  // 父函数范围
  let depth = 0, end = -1;
  for (let j = last; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  console.log('父函数结束 @' + end + ' 长度 ' + (end - last));
  console.log('父函数体前 1000:');
  console.log(c.slice(last, last + 1000));
}
// _$dI 定义
const dI = c.indexOf('function _$dI(');
console.log('\n_$dI 定义 @' + dI + ':', c.slice(dI, dI + 100));
