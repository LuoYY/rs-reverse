// 提取 pc=2139 程序的完整指令序列（含 pc 2130-2160）
const d = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_exec_exact.json');
// 找所有 pc 在 2120-2200 的指令（去重）
const seen = new Set();
const ins = d.filter(x => x.pc >= 2120 && x.pc <= 2220);
// 按执行顺序（去重 pc）
const uniq = [];
seen.clear();
d.forEach(x => {
  if (x.pc >= 2120 && x.pc <= 2220 && !seen.has(x.pc)) { seen.add(x.pc); uniq.push(x); }
});
uniq.sort((a, b) => a.pc - b.pc);
console.log('pc 2120-2220 去重指令数:', uniq.length);
uniq.forEach(x => {
  console.log('  pc=' + x.pc + ' op=' + x.op + ' ' + x.code.slice(0, 100));
});
