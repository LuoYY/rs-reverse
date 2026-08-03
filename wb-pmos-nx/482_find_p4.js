/** 482 找 _$p4 赋值来源 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
console.log('=== _$p4= 赋值（全局）===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$p4=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 60), idx + 60).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 10) break;
}
console.log('_$p4= 总数(前10):', cnt);
// _$p4 作为参数
console.log('\n=== _$p4 在参数列表 ===');
const pm = code.match(/function\s+([_$\w]+)\([^)]*_\$p4[^)]*\)/);
if (pm) console.log('函数:', pm[1], ':', pm[0].substring(0, 120));
// _$mK 的父函数（嵌套定义）
const fnIdx = 54989;
const parent = code.lastIndexOf('function ', fnIdx - 1);
console.log('\n=== _$mK 父函数 @' + parent + ' ===');
console.log(code.substring(parent, parent + 150));
