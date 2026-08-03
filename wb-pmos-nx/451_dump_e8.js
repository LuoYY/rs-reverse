/** 451 dump _$e8 构造器（getFloat16 访问源） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

// _$e8 定义（多种形式）
const patterns = [
  ['function _$e8(', 'function'],
  ['_$e8=function', 'assign'],
  ['_$e8=function(', 'assign2'],
  ['class _$e8', 'class'],
];
for (const [pat, type] of patterns) {
  const idx = code.indexOf(pat);
  if (idx >= 0) {
    console.log('=== _$e8 (' + type + ') @' + idx + ' ===');
    // 括号匹配
    let open = code.indexOf('{', idx);
    if (open < 0) { console.log(code.substring(idx, idx + 300)); continue; }
    let stack = 0, end = -1;
    for (let i = open; i < code.length; i++) {
      if (code[i] === '{') stack++;
      else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
    }
    console.log(code.substring(idx, end + 1).substring(0, 1500));
    console.log('');
  }
}

// 搜 _$$p / _$$8 方法（_$i7 用的）
console.log('=== _$$p 定义 ===');
const pp = code.indexOf('_$$p=function');
if (pp >= 0) console.log(code.substring(pp, pp + 400));
else {
  const pp2 = code.indexOf('_$$p(');
  if (pp2 >= 0) console.log('@' + pp2 + ':', code.substring(Math.max(0, pp2 - 60), pp2 + 200));
}

// 搜 getFloat16 相关（DataView/Float16）
console.log('\n=== DataView/Float16 引用 ===');
for (const kw of ['DataView', 'Float16', 'getFloat', 'setFloat', 'ArrayBuffer']) {
  const c = (code.match(new RegExp(kw, 'g')) || []).length;
  if (c) console.log(kw + ':', c);
}
