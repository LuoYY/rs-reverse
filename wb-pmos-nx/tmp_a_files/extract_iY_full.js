// 完整提取 _$iY / _$fr / _$pI / _$dF 相关编码函数
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
for (const n of ['_$iY', '_$fr', '_$pI', '_$iL', '_$nj', '_$i2', '_$bM', '_$ao', '_$hp']) {
  const fn = extractFn(n);
  console.log('=== ' + n + ' (len=' + fn.length + ') ===');
  console.log(fn.slice(0, 2500));
  console.log();
  // 保存
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/fn_' + n + '.txt', fn);
}
