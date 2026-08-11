// 提取 _$pW===265 分支的完整代码（括号匹配）
const fs = require('fs');
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
const needle = '_$pW===265){';
let idx = c4.indexOf(needle);
console.log('找到 @' + idx);
if (idx >= 0) {
  // 从 '{' 开始括号匹配
  const start = c4.indexOf('{', idx) + 1;
  let depth = 1;
  let end = -1;
  for (let i = start; i < c4.length; i++) {
    if (c4[i] === '{') depth++;
    else if (c4[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  console.log('分支代码:');
  console.log(c4.slice(idx - 10, end + 1));
}
// 也找 _$cg 如何处理
const idx2 = c4.indexOf('_$pW=_$cg');
console.log('\n_$pW=_$cg @' + idx2, idx2 >= 0 ? c4.slice(idx2, idx2 + 80) : '');
// 主循环
const idx3 = c4.indexOf('while(1)');
console.log('\nwhile(1) @' + idx3, idx3 >= 0 ? c4.slice(idx3, idx3 + 200) : '');
