// 提取 pc=1842 程序块 + _$lP 定义
const fs = require('fs');
const d = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_exec_exact.json');

// pc=1842 去重指令
const seen = new Set();
const uniq = [];
d.forEach(x => {
  if (!seen.has(x.pc)) { seen.add(x.pc); uniq.push(x); }
});
// 找 pc 1830-1860
console.log('=== pc 1830-1860 指令 ===');
uniq.filter(x => x.pc >= 1830 && x.pc <= 1860).sort((a, b) => a.pc - b.pc).forEach(x => {
  console.log('  pc=' + x.pc + ' op=' + x.op + ' ' + x.code.slice(0, 110));
});

// _$lP 定义
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
let idx = c.indexOf('_$lP=');
console.log('\n_$lP= @' + idx + ': ' + (idx >= 0 ? c.slice(idx - 50, idx + 120) : 'N/A'));
idx = c.indexOf('_$lP[');
if (idx >= 0) console.log('_$lP[ @' + idx + ': ' + c.slice(idx - 30, idx + 60));
