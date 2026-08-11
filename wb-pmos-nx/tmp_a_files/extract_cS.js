// 提取 _$cS 执行器（JSVMP 指令解释器）和 _$dt/_$iR 等辅助
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

function extractFn(name) {
  let i = c.indexOf('function ' + name + '(');
  if (i < 0) { i = c.indexOf(name + '=function'); }
  if (i < 0) return name + ': N/A';
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
for (const n of ['_$cS', '_$dt', '_$iR', '_$p_', '_$pc']) {
  const fn = extractFn(n);
  console.log('=== ' + n + ' (len=' + fn.length + ') ===');
  console.log(fn.slice(0, 3000));
  console.log();
  if (n === '_$cS') fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/fn__$cS.txt', fn);
}
