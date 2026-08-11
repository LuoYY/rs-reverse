const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
// 找 return 语句（dynCode 返回值）
const m = code.match(/return\{[^}]{0,200}\}/);
console.log('return 语句:', m ? m[0] : 'none');
// 找 IIFE 尾部
const tail = code.slice(-300);
console.log('\n尾部 300:', tail);
// 找 _$dJ / 主循环嵌套
console.log('\n_$dJ 出现:', (code.match(/_$dJ/g) || []).length);
// 找所有 while(1) 主循环（多层 dispatcher）
const loops = code.match(/while\(1\)\{/g);
console.log('while(1) 数:', loops ? loops.length : 0);
