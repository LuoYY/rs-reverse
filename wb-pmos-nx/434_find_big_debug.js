/** 434 调试 findBigFns 正则 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_envtrue.js', 'utf8');

// 方法1：indexOf
const idx = code.indexOf('function _$dy(');
console.log('indexOf function _$dy(:', idx);

// 方法2：正则
const re = /function\s+([_$]\w+)\s*\(/;
const m = re.exec(code);
console.log('正则首匹配:', m ? m[1] + ' @' + m.index : '无');

// 统计
const fnRe = /function\s+([_$]\w+)\s*\(/g;
let fm, count = 0;
while ((fm = fnRe.exec(code)) !== null) {
  count++;
  if (fm[1] === '_$dy') console.log('匹配到 _$dy @' + fm.index);
  if (count > 5000) break;
}
console.log('匹配函数数(前5000):', count);

// 试简化正则
const re2 = /function/g;
const m2 = re2.exec(code);
console.log('function 首匹配:', m2 ? '@' + m2.index : '无');
