// 找 op=2131 的语义（base 生成函数调用）
const fs = require('fs');
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
const m = c4.match(/_\$pW===2131\)\{([^}]*)\}/);
console.log('op=2131:', m ? m[1].slice(0, 200) : 'N/A');
// 也找 1842/265/1601/1593
[1842, 265, 1601, 1593, 1582, 2137, 2139].forEach(op => {
  const mm = c4.match(new RegExp('_\\$pW===' + op + '\\)\\{([^}]*)\\}'));
  console.log('op=' + op + ':', mm ? mm[1].slice(0, 150) : 'N/A');
});
