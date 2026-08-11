const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$la 赋值：_$do._$la=_$gH（while(4) opcode 1560）
// 也搜 '_$la=0' 或 '_$la=N'
for (const pat of ['_$la=0', '_$la=1', '_$la=', '_$la=2', '_$la=_', 'var _$la']) {
  let i = c.indexOf(pat);
  while (i >= 0) {
    const ctx = c.slice(i - 30, i + 60);
    if (ctx.includes('while') || ctx.includes('var') || i > 400000) {
      console.log(pat + ' @' + i + ': ...' + ctx);
      break;
    }
    i = c.indexOf(pat, i + 1);
    if (i > 500000) break;
  }
}
// while(3) 父函数的参数（IIFE 调用 _$lP[0]）
// 看整个 dynCode 的 IIFE 结构：$_ts.scj → 参数
const iife = c.indexOf('(function(_$$5,_$lP){');
console.log('\nIIFE @' + iife);
console.log(c.slice(iife, iife + 200));
// 找 IIFE 调用处（结尾）
console.log('\nIIFE 调用处:');
console.log(c.slice(c.length - 200));
