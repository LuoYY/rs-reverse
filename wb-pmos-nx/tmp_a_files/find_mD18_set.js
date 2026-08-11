const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$mD[18]= 赋值
let i = 0, n = 0;
while ((i = c.indexOf('_$mD[18]=', i)) >= 0 && n < 10) {
  console.log('_$mD[18]= @' + i + ': ...' + c.slice(i - 40, i + 60));
  i += 10; n++;
}
console.log('总数:', n);
// _$mD 整体赋值（_$mD={} 或 _$mD=[...]）
i = 0;
while ((i = c.indexOf('_$mD=', i)) >= 0 && n < 20) {
  console.log('_$mD= @' + i + ': ...' + c.slice(i - 30, i + 50));
  i += 5; n++;
}
// 搜 jf 属性设置（_$mD[18] 对象）
i = 0;
while ((i = c.indexOf('.jf=', i)) >= 0 && n < 20) {
  console.log('.jf= @' + i + ': ...' + c.slice(i - 50, i + 30));
  i += 4; n++;
}
