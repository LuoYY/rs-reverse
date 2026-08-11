// 提取 _$fx 函数（base 生成核心，_$aq 调用它）
const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
const idx = code.indexOf('function _$fx');
console.log('function _$fx @', idx);
if (idx >= 0) {
  let depth = 0, end = -1;
  for (let i = idx; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = code.slice(idx, end + 1);
  console.log('_$fx 函数体长度:', body.length);
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_fx_fn.js', body);
  console.log('=== _$fx 源码 ===');
  console.log(body);
}
