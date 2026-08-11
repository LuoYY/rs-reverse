// 分析 op=265 调用（59 次）：参数模式 vs base 结构
const calls = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_c4_calls.json');
const fs = require('fs');
// 找 op=265 调用
const ops265 = calls.map((c, i) => ({ i, c })).filter(x => x.c.split('|')[0] === '265');
console.log('op=265 调用数:', ops265.length);
ops265.forEach(x => {
  console.log('#' + x.i + ': ' + x.c.slice(0, 80));
});
