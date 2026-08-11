const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// op383 handler 在 384 分支的 else 区。找 384 分支完整内容
const pat = '}else if(_$jc<384){';
let idx = c.indexOf(pat);
console.log('384 分支 @' + idx);
// 打印直到 384 else 区结束（找 _\$jc<384){ 后的匹配括号）
// 结构：if(_$jc<384){...}else{<>=384 区>}
const start384 = idx + pat.length - 1; // '{' 位置
let depth = 0, end = -1;
for (let i = start384; i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
console.log('384 块结束 @' + end + ' 长度 ' + (end - start384));
console.log('\n=== 384 块内容 ===');
console.log(c.slice(start384, end + 1));
