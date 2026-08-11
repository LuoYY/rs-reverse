// 提取 _$iR 完整函数（JSVMP 闭包，@115341），它内部含 _$cS 解释器 + 所有辅助
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$iR 定义（@115341 区域，前面是 function _$iR(_$md,_$pc){return _$aq;function _$aq(){...
let i = c.indexOf('function _$iR(_$md,_$pc){');
console.log('function _$iR(_$md,_$pc){ @' + i);
if (i >= 0) {
  let depth = 0, end = -1;
  for (let j = c.indexOf('{', i); j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  const fn = c.slice(i, end + 1);
  console.log('_$iR 长度:', fn.length);
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_iR_closure.js', fn);
  console.log('已保存 jsvmp_iR_closure.js');
  console.log(fn.slice(0, 800));
}
// 也找调用 _$iR 的地方（确认它是工厂）
let j = 0, n = 0;
while ((j = c.indexOf('_$iR(', j)) >= 0 && n < 10) {
  console.log('_$iR( @' + j + ': ...' + c.slice(j - 40, j + 30));
  j += 5; n++;
}
