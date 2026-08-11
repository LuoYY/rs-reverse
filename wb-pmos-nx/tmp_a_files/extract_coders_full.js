// 提取 base 编码函数完整源码：_$hB/_$eb/_$op/_$mX/_$_c/_$pJ/_$$y
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
function extractFn(name) {
  let i = c.indexOf('function ' + name + '(');
  if (i < 0) return name + ': N/A';
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
for (const n of ['_$hB', '_$eb', '_$op', '_$mX', '_$_c', '_$pJ', '_$$y', '_$g1', '_$l2', '_$e4']) {
  console.log('=== ' + n + ' ===');
  console.log(extractFn(n));
  console.log();
}
