// 提取 _$mD[615] 的定义（编码器）和 _$mD 构建
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

// 搜 _$mD[615]= 赋值
const pats = ['_$mD[615]=', '_$mD[615] =', 'mD[615]='];
for (const p of pats) {
  let i = c.indexOf(p);
  console.log('"' + p + '" @' + i);
  if (i >= 0) console.log(c.slice(i - 50, i + 200));
  console.log();
}

// 搜 _$mD 定义（数组初始化）
let i = c.indexOf('_$mD=[');
console.log('_$mD=[ @' + i);
if (i >= 0) console.log(c.slice(i, i + 300));

// 搜 mD[615] 所有出现
let j = 0, n = 0;
while ((j = c.indexOf('mD[615]', j)) >= 0 && n < 10) {
  console.log('mD[615] @' + j + ': ' + c.slice(j - 30, j + 60));
  j += 5; n++;
}
