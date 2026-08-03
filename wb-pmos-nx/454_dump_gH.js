/** 454 dump _$gH（环境检测调度器）+ 找 getFloat16 访问 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

// 从 _$oQ:_$gH 提取函数名
const m = code.match(/_\$oQ:([_$\w]+)/);
const fnName = m ? m[1] : '_$gH';
console.log('方法表函数:', fnName);

// dump 函数定义
const cIdx = code.indexOf('function ' + fnName + '(');
if (cIdx >= 0) {
  let open = code.indexOf('{', cIdx), stack = 0, end = -1;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  const body = code.substring(cIdx, end + 1);
  console.log('=== ' + fnName + ' (' + body.length + ' chars) ===');
  console.log('开头 500:', body.substring(0, 500));
  // 找 getFloat16 相关（DataView/Float16/属性名数组访问）
  console.log('\ngetFloat16 字面量:', (body.match(/getFloat16/g) || []).length);
  console.log('DataView:', (body.match(/DataView/g) || []).length);
  // 找 .getFloat16 或 [getFloat16] 访问模式（属性名数组）
  const accM = body.match(/([_$\w]+)\[([_$\w]+)\[\d+\]\]/g);
  console.log('属性名数组访问数:', accM ? accM.length : 0);
  // 找 new DataView / new _$XX（构造器）
  const newM = body.match(/new\s+([_$\w]+)/g);
  console.log('new 构造器:', newM ? [...new Set(newM)].slice(0, 10).join(', ') : '无');
} else {
  console.log(fnName + ' 未找到 function 定义');
  // 赋值形式
  const aIdx = code.indexOf(fnName + '=function');
  if (aIdx >= 0) console.log('赋值形式 @' + aIdx);
}

// 也看 _$gH 被调用形式（环境 ID）
console.log('\n=== ' + fnName + ' 调用 ID ===');
const ids = {};
let idx = 0;
while ((idx = code.indexOf(fnName + '(', idx)) !== -1) {
  const after = code.substring(idx + fnName.length + 1, idx + fnName.length + 15);
  const numM = after.match(/^(\d+)/);
  if (numM) ids[numM[1]] = (ids[numM[1]] || 0) + 1;
  idx += fnName.length + 1;
}
console.log(JSON.stringify(ids));
