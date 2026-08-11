// 看 aebi[1] pc=1490-1510 的指令（_$ll=_$kB[7] 附近）+ pc=1527（_$kB 初始化）
const fs = require('fs');
const dis = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_aebi_disasm_full.txt', 'utf8');
const lines = dis.split('\n');
lines.forEach(l => {
  const m = l.match(/pc=(\d+)/);
  if (m) {
    const pc = +m[1];
    if ((pc >= 1490 && pc <= 1530)) console.log(l);
  }
});
console.log('=== _$kB 初始化相关（pc=1527）===');
// 从 nx_exec_exact.json 找 _$kB 初始化的执行
try {
  const exec = require('./nx_exec_exact.json');
  exec.forEach(x => {
    if (x.pc === 1527 || (x.code && x.code.includes('_$kB=['))) console.log('IDX' + x.idx + ' pc' + x.pc + ' op' + x.op + ':', x.code.slice(0, 150));
  });
} catch(e) { console.log('exec_exact 不存在'); }
