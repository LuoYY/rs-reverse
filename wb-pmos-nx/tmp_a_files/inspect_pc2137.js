// 看 pc=2130-2145 反汇编（_$mS 调用的数字/标识符解析程序）
const fs = require('fs');
const dis = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_aebi_disasm_full.txt', 'utf8');
const lines = dis.split('\n');
lines.forEach(l => {
  const m = l.match(/pc=(\d+)/);
  if (m) {
    const pc = +m[1];
    if (pc >= 2128 && pc <= 2145) console.log(l);
  }
});
// 从执行流看 pc=2137 的实际执行
console.log('\n=== 执行流 pc 2128-2145 ===');
try {
  const exec = require('./nx_exec_exact.json');
  exec.forEach(x => {
    if (x.pc >= 2128 && x.pc <= 2145) console.log('IDX' + x.idx + ' pc' + x.pc + ' op' + x.op + ':', (x.code || '').slice(0, 100));
  });
} catch(e) { console.log('exec_exact 不存在'); }
