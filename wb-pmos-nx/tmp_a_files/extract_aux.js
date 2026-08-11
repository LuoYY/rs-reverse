// 提取 JSVMP 辅助函数：_$i0（操作数判断）、_$dt、_$$m、_$md、_$o8 等
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
function extractFn(name) {
  let i = c.indexOf('function ' + name + '(');
  if (i < 0) { i = c.indexOf(name + '=function('); }
  if (i < 0) return name + ': N/A';
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
for (const n of ['_$i0', '_$dt', '_$$m', '_$md', '_$o8', '_$aN', '_$fD', '_$ie', '_$i0', '_$_J']) {
  console.log('=== ' + n + ' ===');
  console.log(extractFn(n).slice(0, 500));
  console.log();
}
