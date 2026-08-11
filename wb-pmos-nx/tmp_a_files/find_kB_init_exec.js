// 从执行流找 _$kB 初始化（pc=1527）和 _$ll 赋值（pc=1500）的实际执行
const fs = require('fs');
const exec = require('./nx_exec_exact.json');
console.log('exec_exact 条数:', exec.length);
// 找 _$kB=[ 或 _$kB= 的指令
exec.forEach(x => {
  if (x.code && (x.code.includes('_$kB=[') || x.code.includes('_$kB =') || x.code.includes('_$kB='))) {
    console.log('IDX' + x.idx + ' pc' + x.pc + ' op' + x.op + ':', x.code.slice(0, 120));
  }
});
console.log('--- _$ll 相关 ---');
exec.forEach(x => {
  if (x.code && x.code.includes('_$ll=')) {
    console.log('IDX' + x.idx + ' pc' + x.pc + ' op' + x.op + ':', x.code.slice(0, 120));
  }
});
console.log('--- pc 1500-1527 执行序列 ---');
exec.forEach(x => {
  if (x.pc >= 1495 && x.pc <= 1527) console.log('IDX' + x.idx + ' pc' + x.pc + ' op' + x.op + ':', (x.code || '').slice(0, 100));
});
