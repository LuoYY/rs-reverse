// 找 _$f3 / _$np / _$ie / _$mT / _$cD / _$gL 在 dynCode 中的初始化
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

for (const v of ['_$f3', '_$np', '_$ie', '_$mT', '_$cD', '_$gL']) {
  let i = 0, n = 0, first = -1;
  const assigns = [];
  while ((i = c.indexOf(v + '=', i)) >= 0 && n < 8) {
    if (first < 0) first = i;
    assigns.push(c.slice(i, i + 80));
    i += v.length + 1;
    n++;
  }
  console.log('=== ' + v + ' (refs ' + n + ') ===');
  if (first >= 0) console.log('  var 声明附近:', c.slice(Math.max(0, first - 120), first).replace(/\n/g, ' ').slice(-120));
  assigns.forEach(a => console.log('  = ...' + a.slice(0, 70)));
}
// 也搜 _$f3 作为变量声明（var _$f3 或 ,_$f3）
console.log('\n=== var 声明 ===');
for (const v of ['_$f3', '_$np', '_$ie', '_$mT', '_$cD', '_$gL']) {
  let i = c.indexOf('var _$' + v.slice(2) + ',');
  if (i < 0) i = c.indexOf('var _$' + v.slice(2) + '=');
  if (i < 0) i = c.indexOf(',' + v + ',');
  console.log(v + ': var @' + i + (i >= 0 ? ' ...' + c.slice(i, i + 60) : ''));
}
