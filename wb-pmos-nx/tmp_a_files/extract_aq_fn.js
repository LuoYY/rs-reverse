// 提取 _$aq 函数源码（base 生成函数，_$mD[615]）
const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
// 找 function _$aq
const idx = code.indexOf('function _$aq');
console.log('function _$aq @', idx);
if (idx >= 0) {
  let depth = 0, end = -1;
  for (let i = idx; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = code.slice(idx, end + 1);
  console.log('_$aq 函数体长度:', body.length);
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_aq_fn.js', body);
  console.log('已保存 nx_aq_fn.js');
  // 打印前 3000 字符
  console.log('\n=== _$aq 源码（前 3000） ===');
  console.log(body.slice(0, 3000));
}
