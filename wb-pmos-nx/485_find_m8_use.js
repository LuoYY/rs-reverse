/** 485 找入口函数 _$m8（aebi）的使用 + 内层 VM 环境数组传递 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

// 入口函数参数 _$m8 的使用
console.log('=== _$m8 使用（前 15）===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$m8', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 50), idx + 60).replace(/\n/g, ' ')}`);
  idx += 4;
  if (cnt > 15) break;
}
console.log('_$m8 总数(前15):', cnt);

// 入口函数结尾（调用）
console.log('\n=== 结尾 300 ===');
console.log(code.substring(code.length - 300));

// 找内层 VM 函数的调用（4 参数传环境数组）
// 找模式：XXX(A,B,C,D) 其中 D 是 _$m8 相关
console.log('\n=== 传 _$m8 或 aebi 的 4 参调用 ===');
const c = code.match(/([_$\w]+)\(([_$\w]+),([_$\w]+),([_$\w]+),([_$\w]+)\)/g);
if (c) {
  const uniq = [...new Set(c)];
  console.log('4 参调用（前 15）:', uniq.slice(0, 15).join(' | '));
}
