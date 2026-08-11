// 查看 _$c4 函数入口：参数如何分配，找 op=265 相关内层处理
const fs = require('fs');
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
const i = c4.indexOf('function _$c4(');
console.log('idx:', i);
console.log(c4.slice(i, i + 1500));
