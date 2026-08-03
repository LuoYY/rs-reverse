/** 459 找 _$pJ 环境对象池来源 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

// 报错位置 76206 所在函数
const pos = 76206;
const fnIdx = code.lastIndexOf('function ', pos);
console.log('=== 报错函数 @' + fnIdx + ' ===');
console.log(code.substring(fnIdx, fnIdx + 250));

// _$pJ 赋值（报错函数内 + 全局）
console.log('\n=== _$pJ 赋值（前 10）===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$pJ=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 70), idx + 70).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 10) break;
}

// _$pJ 在报错函数的定义
const fnBody = code.substring(fnIdx, pos + 1000);
const pJdef = fnBody.match(/_\$pJ\s*=[^;,]{0,80}/);
if (pJdef) console.log('\n报错函数内 _$pJ 定义:', pJdef[0]);

// _$ky 来源（对象索引）
const kyDef = fnBody.match(/_\$ky\s*=[^;,]{0,60}/);
if (kyDef) console.log('_$ky 定义:', kyDef[0]);
