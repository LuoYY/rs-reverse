const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 收集所有 '!_$lj?' 条件跳转（环境检测反调试分支）
const re = /!_\$lj\?[^;]{0,20};/g;
const matches = c.match(re);
console.log('总数:', matches ? matches.length : 0);
if (matches) {
  const uniq = [...new Set(matches)];
  console.log('唯一形式:', uniq.length);
  uniq.forEach(m => console.log('  ', m));
  // 记录每个出现位置上下文（opcode 关联）
  console.log('\n=== 上下文（去重前30个） ===');
  let i = 0, n = 0;
  while ((i = c.indexOf('!_$lj?', i)) >= 0 && n < 30) {
    const ctx = c.slice(Math.max(0, i - 60), i + 30);
    console.log('@' + i + ': ...' + ctx);
    i += 6; n++;
  }
}
