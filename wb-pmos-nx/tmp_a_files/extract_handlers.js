// 提取 _$f1 函数表的所有处理器实现（_$aq/_$_T/_$hr/_$kx/_$hi/_$ms/_$fZ/_$p2/_$lZ/_$kc/_$_q/_$fU 等）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

// 处理器名称（从 nx_f1_map.json）
const map = require('./nx_f1_map.json');
const names = [...new Set(Object.values(map))];
console.log('处理器:', names.join(','));

function extractFn(name) {
  // 找 function name(
  let i = c.indexOf('function ' + name + '(');
  if (i < 0) return name + ': N/A';
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
for (const n of names) {
  const fn = extractFn(n);
  console.log('=== ' + n + ' (len=' + fn.length + ') ===');
  console.log(fn.slice(0, 400));
  console.log();
}
