/** 456 找 _$m9 环境对象池来源 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

// _$m9 所有赋值
console.log('=== _$m9 赋值（前 10）===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$m9=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 60), idx + 80).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 10) break;
}
console.log('_$m9= 总数(前10):', cnt);

// _$m9 作为参数（function(..._$m9...)）
console.log('\n=== _$m9 在函数参数 ===');
const pm = code.match(/function\s+([_$\w]+)\([^)]*_\$m9[^)]*\)/);
if (pm) console.log('函数:', pm[1], ':', pm[0].substring(0, 120));

// 报错位置 100386 的 dispatcher（_$dR）所在函数
console.log('\n=== 报错 dispatcher 所在函数 ===');
const pos = 100386;
const fnIdx = code.lastIndexOf('function ', pos);
console.log('@' + fnIdx + ':', code.substring(fnIdx, fnIdx + 150));

// _$m9 在报错函数里的定义
const fnBody = code.substring(fnIdx, pos + 2000);
const m9def = fnBody.match(/_\$m9\s*=[^;,]{0,60}/);
if (m9def) console.log('_$m9 定义:', m9def[0]);
