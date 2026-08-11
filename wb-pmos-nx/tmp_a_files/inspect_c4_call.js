const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_op13_local_patched.js', 'utf8');
// 找 _$c4 的调用点（332 个），看第一个参数（操作码）和 $_ez 如何传入
// 关键：_$c4(_$cg,_$ez,_$pL,_$gc,_$pb,_$nx,_$cQ) 参数从哪来
// 打印几个代表性调用
let idx = 0, count = 0;
while ((idx = code.indexOf('_$c4(', idx + 1)) >= 0 && count < 8) {
  count++;
  const ctx = code.slice(Math.max(0, idx - 50), Math.min(code.length, idx + 90));
  console.log('call#' + count, '...' + ctx.replace(/\n/g, ' ').slice(0, 140) + '...');
  console.log();
}
// 找 _$c4 定义处的默认参数/初始值
const defIdx = code.indexOf('function _$c4(');
console.log('_$c4 定义:', code.slice(defIdx, defIdx + 150));
// 找 aebi 传入（主入口）
const entryIdx = code.indexOf('_$lP[1]');
if (entryIdx >= 0) console.log('\n入口 $_lP[1] ctx:', code.slice(entryIdx - 60, entryIdx + 80));
