/** 481 检查 _$p4 赋值（属性名池是否兜底） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
const fnIdx = 54989;
// 函数开头 3000 字符
const body = code.substring(fnIdx, fnIdx + 3000);
console.log('=== 函数开头（_$pS 元素赋值）===');
// 找 _$pS[0]/[1] 的赋值
const m0 = body.match(/([_$\w]+)=\s*\(\(\(_$pS\)&&\(_$pS\)\[0\]\)\|\|__proxy\(\)\)/);
const m1 = body.match(/([_$\w]+)=\s*\(\(\(_$pS\)&&\(_$pS\)\[1\]\)\|\|__proxy\(\)\)/);
console.log('_$pS[0] 赋值到:', m0 ? m0[1] : '未找到');
console.log('_$pS[1] 赋值到:', m1 ? m1[1] : '未找到');
// 看前 600 字符
console.log('\n=== 函数开头 600 ===');
console.log(body.substring(0, 600));
// 找 _$p4 赋值（整个函数）
console.log('\n=== _$p4= 赋值 ===');
let idx = 0, cnt = 0;
while ((idx = body.indexOf('_$p4=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt}: ${body.substring(Math.max(0, idx - 30), idx + 60)}`);
  idx += 5;
  if (cnt > 5) break;
}
