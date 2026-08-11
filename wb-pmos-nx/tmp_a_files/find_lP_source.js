const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$lP 来源：dynCode 开头 IIFE 参数（$_ts.scj 和 $_ts.aebi）
// while(3) 前：var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];
// 找 _$lP 的赋值（IIFE 参数）
for (const pat of ['_$lP=', '_$lP =', '_$lP[0]', '_$lP=_']) {
  let i = c.indexOf(pat);
  console.log(pat + ' @' + i + (i >= 0 ? ': ...' + c.slice(i - 60, i + 80) : ''));
}
// IIFE 调用处
let i = c.indexOf('$_ts.aebi');
console.log('\n$_ts.aebi @' + i + ': ...' + c.slice(i - 80, i + 80));
// while(3) 上下文：_$lP 传参
const i3 = c.indexOf('var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];');
console.log('\nwhile(3) 前 @' + i3 + ': ...' + c.slice(i3 - 500, i3 + 100));
