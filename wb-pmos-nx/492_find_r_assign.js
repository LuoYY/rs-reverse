/** 492 找报错函数的 _$_r 赋值（属性名池来源） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
const pos = 44815;
// 找所在函数
const fnIdx = code.lastIndexOf('function ', pos);
console.log('=== 所在函数 @' + fnIdx + ' ===');
console.log(code.substring(fnIdx, fnIdx + 400));
// 找 _$_r 赋值（函数内）
const fnBody = code.substring(fnIdx, pos + 100);
console.log('\n=== _$_r= 赋值（函数内）===');
let idx = 0, cnt = 0;
while ((idx = fnBody.indexOf('_$_r=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt}: ${fnBody.substring(Math.max(0, idx - 30), idx + 60)}`);
  idx += 5;
  if (cnt > 6) break;
}
if (cnt === 0) console.log('函数内无 _$_r= 赋值（闭包变量）');
// 全局找 _$_r= 
console.log('\n=== 全局 _$_r= （前 6）===');
idx = 0; cnt = 0;
while ((idx = code.indexOf('_$_r=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 40), idx + 40)}`);
  idx += 5;
  if (cnt > 6) break;
}
