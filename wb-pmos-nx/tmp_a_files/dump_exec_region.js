// 看执行流关键区域：pc=1570-1610（XOR 循环附近）+ pc=260-290（_$mD[615] 调用）
const fs = require('fs');
const exec = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_exec_exact.json');

console.log('=== pc 1570-1610（XOR/base 生成区） ===');
exec.forEach(a => {
  if (a.pc >= 1570 && a.pc <= 1610) {
    console.log('#' + a.idx + ' pc=' + a.pc + ' op=' + a.op + ' → ' + a.code.slice(0, 130));
  }
});

console.log('\n=== pc 255-290（_$mD[615] 调用区） ===');
exec.forEach(a => {
  if (a.pc >= 255 && a.pc <= 290) {
    console.log('#' + a.idx + ' pc=' + a.pc + ' op=' + a.op + ' → ' + a.code.slice(0, 130));
  }
});
