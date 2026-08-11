// 提取 _$kx 主函数（@114483，JSVMP 入口：环境构建 + fL=1 映射）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = 114483;
let depth = 0, end = -1;
for (let i = c.indexOf('{', start); i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const fn = c.slice(start, end + 1);
console.log('_$kx 主函数长度:', fn.length);
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_kx_main.js', fn);
console.log(fn.slice(0, 1000));
// 也检查 _$kx 到 _$iE 之间是否还有内容（闭包边界）
console.log('\n_$kx 结束 @' + end + ', _$iE @' + c.indexOf('function _$iE('));
