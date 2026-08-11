const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
// 找 function _$c4
const idx = code.indexOf('function _$c4');
console.log('function _$c4 @', idx);
if (idx >= 0) {
  // 找函数体边界（下一个顶层 function）
  let depth = 0, end = -1;
  for (let i = idx; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = code.substring(idx, end + 1);
  console.log('函数体长度:', body.length);
  // 找 var 声明
  const vars = body.match(/var ([_\$a-zA-Z0-9]+)/g);
  console.log('var 声明:', vars ? vars.join(',') : 'none');
  // 找 while(1)
  const m = body.indexOf('while(1)');
  console.log('while(1) @', m);
  // 找 return
  const rm = body.indexOf('return');
  console.log('return @', rm, '→', rm >= 0 ? body.substring(rm, rm + 80) : '');
}
