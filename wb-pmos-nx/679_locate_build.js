/**
 * 679_locate_build.js
 * 定位 dynCode 里 basearr 构造代码（_$ _​$a @107351 定时器回调 + _$_K @111270 push）
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_cur.js', 'utf8');
console.log('dynCode len:', code.length);

// 定位 @107351（_$$a 定时器回调）和 @111270（_$_K push）
const pos1 = 107351, pos2 = 111270;
console.log('\n=== @107351 前后 500 ===');
console.log(code.substring(pos1 - 250, pos1 + 250));

console.log('\n=== @111270 前后 800 ===');
console.log(code.substring(pos2 - 400, pos2 + 400));

// 找 _$_K 函数定义
const kIdx = code.indexOf('function _$_K');
console.log('\nfunction _$_K @', kIdx);
if (kIdx > 0) {
  const openBrace = code.indexOf('{', kIdx);
  let stack = 0, end = -1;
  for (let i = openBrace; i < Math.min(openBrace + 100000, code.length); i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  console.log('_$_K 定义 (len=' + (end - kIdx) + '):');
  console.log(code.substring(kIdx, Math.min(end + 1, kIdx + 2500)));
  fs.writeFileSync('/tmp/nx_build_K.js', code.substring(kIdx, end + 1));
}

// 找 _$$a 定义（定时器回调）
const aIdx = code.indexOf('function _$$a');
console.log('\nfunction _$$a @', aIdx);
if (aIdx > 0) {
  const openBrace = code.indexOf('{', aIdx);
  let stack = 0, end = -1;
  for (let i = openBrace; i < Math.min(openBrace + 50000, code.length); i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  console.log('_$$a 定义 (len=' + (end - aIdx) + '):');
  console.log(code.substring(aIdx, Math.min(end + 1, aIdx + 1200)));
  fs.writeFileSync('/tmp/nx_build_a.js', code.substring(aIdx, end + 1));
}
