/**
 * 866_locate_725_function.js
 * 精确定位 opcode 725 (_$oU=_$kB[0]) 所在函数
 * 用更精确的函数定位
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// opcode 725 的位置
const op725 = body.indexOf('_\$oU=_$kB[0]');
console.log('opcode 725 @', op725);

// 向前找最近的 function 定义（正确处理嵌套）
// 用括号匹配找函数
const fnStart = body.lastIndexOf('function', op725);
console.log('最近 function @', fnStart);
const fnMatch = body.substring(fnStart, fnStart + 60).match(/function (_\$\w+)/);
console.log('函数名:', fnMatch ? fnMatch[1] : '?');

// 找函数完整范围
let depth = 0, end = fnStart;
for (let i = fnStart; i < body.length; i++) {
  if (body[i] === '{') depth++;
  else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
console.log('函数范围: [' + fnStart + '-' + end + '] size=' + (end - fnStart));
console.log('函数开头:', body.substring(fnStart, fnStart + 120));

// 检查该函数是否含 _\$kB 初始化
const fnBody = body.substring(fnStart, end);
console.log('\n含 _\$kB=_$pL[0]:', fnBody.includes('_\$kB=_$pL[0]'));
console.log('含 _\$kB=_$ne(_$gc):', fnBody.includes('_\$kB=_$ne(_$gc)'));
console.log('含 _\$k0:', fnBody.includes('_\$k0'));
console.log('含 _\$pL:', fnBody.includes('_\$pL'));

// 找 _\$kB 在该函数中的赋值
let idx = 0;
while ((idx = fnBody.indexOf('_\$kB=', idx)) >= 0) {
  console.log('_\$kB= @' + (fnStart + idx) + ': ' + fnBody.substring(idx - 25, idx + 50).replace(/\n/g, ' '));
  idx += 4;
  if (idx > 20000) break;
}