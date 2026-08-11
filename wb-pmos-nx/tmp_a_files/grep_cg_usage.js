// 找 _$c4 内部 _$cg 的使用方式 + 主循环位置
const fs = require('fs');
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
// _$cg 使用
let idx = 0, n = 0;
while ((idx = c4.indexOf('_$cg', idx)) >= 0 && n < 15) {
  console.log('_$cg @' + idx + ': ' + c4.slice(idx - 30, idx + 50).replace(/\n/g, ' '));
  idx += 4; n++;
}
// 主循环出现次数
let w = 0, wi = 0;
while ((wi = c4.indexOf('while(1)', wi)) >= 0) { w++; wi += 8; }
console.log('\nwhile(1) 出现次数:', w);
// 找 _$hF 定义和主 dispatcher（大 while）
const iHf = c4.indexOf('function _$hF(');
console.log('\n_$hF @' + iHf, iHf >= 0 ? c4.slice(iHf, iHf + 300) : 'N/A');
