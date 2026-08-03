/** 460 找 _$$k 调用（_$_t 环境数组来源） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

// _$$k( 调用
console.log('=== _$$k( 调用（前 8）===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$$k(', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 100), idx + 80).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 8) break;
}
console.log('_$$k( 总数:', cnt);

// 也找 _$h5( 4 参数调用（报错的另一个 VM 函数）
console.log('\n=== 4 参数 VM 函数调用模式（传环境数组）===');
// 找 XXX(YYY, N, N, ZZZ) 形式（4 参数，第 4 是环境数组）
const calls = code.match(/([_$\w]+)\(([_$\w]+),\d+,\d+,([_$\w]+)\)/g);
if (calls) {
  console.log('4 参数调用（前 10）:');
  [...new Set(calls)].slice(0, 10).forEach(c => console.log('  ' + c));
}
