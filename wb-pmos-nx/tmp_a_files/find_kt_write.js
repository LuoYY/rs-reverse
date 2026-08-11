// 找 while(4) 里 _$kt 的写入（base 会话段生成）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$kt 初始化 + 写入
let i = 0, n = 0;
while ((i = c.indexOf('_$kt=', i)) >= 0 && n < 10) {
  console.log('_$kt= @' + i + ': ...' + c.slice(i, i + 60));
  i += 5; n++;
}
// _$kt.push 或 _$kt[_$kt.length]
i = 0; n = 0;
while ((i = c.indexOf('_$kt.push', i)) >= 0 && n < 10) {
  console.log('_$kt.push @' + i + ': ...' + c.slice(i - 30, i + 40));
  i += 9; n++;
}
// 关键：base 会话段写入（huffman 编码）
i = 0; n = 0;
while ((i = c.indexOf('_$kt[', i)) >= 0 && n < 20) {
  const seg = c.slice(i, i + 60);
  if (seg.includes('=')) console.log('_$kt[ @' + i + ': ...' + seg);
  i += 4; n++;
}
