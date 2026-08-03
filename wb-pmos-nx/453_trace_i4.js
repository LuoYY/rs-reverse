/** 453 追踪 _$i4 构造器 + _$oQ 方法（getFloat16 访问源） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

const pos = 346489;
// 找 _$i4 赋值（报错前 8000）
const seg = code.substring(Math.max(0, pos - 8000), pos);
console.log('=== _$i4 赋值 ===');
let idx = 0, cnt = 0;
while ((idx = seg.indexOf('_$i4=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt}: ${seg.substring(Math.max(0, idx - 30), idx + 70).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 8) break;
}

// 找 _$i4=new 的构造器
const newM = seg.match(/_\$i4=new\s+([_$\w]+)/);
if (newM) {
  const cls = newM[1];
  console.log('\n=== 构造器 ' + cls + ' 定义 ===');
  const cIdx = code.indexOf('function ' + cls + '(');
  if (cIdx >= 0) {
    let open = code.indexOf('{', cIdx), stack = 0, end = -1;
    for (let i = open; i < code.length; i++) {
      if (code[i] === '{') stack++;
      else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
    }
    console.log(code.substring(cIdx, end + 1).substring(0, 800));
  }
}

// 找 _$oQ 方法定义（原型/this 赋值）
console.log('\n=== _$oQ 方法定义 ===');
for (const pat of ['_$oQ=function', '_$oQ:', '._$oQ=function', 'prototype._$oQ']) {
  const oIdx = code.indexOf(pat);
  if (oIdx >= 0) {
    console.log(pat + ' @' + oIdx + ':', code.substring(oIdx, oIdx + 300).replace(/\n/g, ' '));
  }
}
