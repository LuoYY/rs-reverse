// 找 _$jc dispatcher 的循环结构（初始化 dispatcher）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$jc dispatcher 的循环：搜 _$jc 相关 while/for
// 找 _\$jc= 赋值（游标初始化）
let i = c.indexOf('_$jc=_');
console.log('_$jc=_ @' + i);
if (i >= 0) console.log(c.slice(i - 50, i + 100));
// 找 _$jc dispatcher 的主循环（while 或 for 用 _$jc）
// 搜 "_$jc" 附近的 while/for
let j = 0, n = 0;
while ((j = c.indexOf('while', j)) >= 0 && n < 20) {
  const ctx = c.slice(j, j + 150);
  if (ctx.includes('_$jc')) {
    console.log('@' + j + ': ' + ctx.slice(0, 120));
  }
  j += 5; n++;
}
// 找 _$jc dispatcher 的开头（可能是 function 里的 for）
// @249417 是 case 141，往前找它的 dispatcher
const seg = c.slice(240000, 250000);
console.log('\n=== @240000-250000 的循环 ===');
let k = seg.indexOf('for(');
while (k >= 0) {
  console.log('for @' + (240000 + k) + ': ' + seg.slice(k, k + 100));
  k = seg.indexOf('for(', k + 1);
}
k = seg.indexOf('while(');
while (k >= 0) {
  console.log('while @' + (240000 + k) + ': ' + seg.slice(k, k + 100));
  k = seg.indexOf('while(', k + 1);
}
