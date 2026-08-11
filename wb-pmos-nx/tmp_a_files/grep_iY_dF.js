// 找 _$iY 定义和 _$dF
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
function extractFn(name) {
  let i = c.indexOf('function ' + name + '(');
  if (i < 0) return 'N/A';
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
for (const n of ['_$iY', '_$dF', '_$iZ']) {
  console.log('=== ' + n + ' ===');
  console.log(extractFn(n).slice(0, 700));
  console.log();
}
// _$iY 赋值
let idx = c.indexOf('_$iY=');
if (idx >= 0) console.log('_$iY= @' + idx + ': ' + c.slice(idx, idx + 100));
