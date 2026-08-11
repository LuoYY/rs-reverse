const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$la 定义（while(3) 前附近）
for (const pat of ['_$la=', '_$la =', 'var _$la', '_$la,']) {
  let i = c.indexOf(pat, 165000);
  console.log(pat + ' @' + i + (i >= 0 ? ': ...' + c.slice(i - 80, i + 80) : ''));
}
// while(3) 所在函数：向前找 function
const i3 = c.indexOf('var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];');
const before = c.slice(0, i3);
let lastFn = before.lastIndexOf('function ');
console.log('\nwhile(3) 父函数 @' + lastFn + ': ' + c.slice(lastFn, lastFn + 120));
// 父函数的参数（IIFE 参数会传到 _$lP）
// 找父函数的声明范围
let depth = 0, end = -1;
for (let i = lastFn; i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
console.log('父函数结束 @' + end);
console.log('\n父函数开头 800:');
console.log(c.slice(lastFn, lastFn + 800));
