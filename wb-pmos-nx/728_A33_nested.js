const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 精确确定 _\$b1 @75498 属于哪个函数：往前找最近的 function（用括号匹配法确定函数边界）
const b1 = code.indexOf('function _$b1');
// 从 b1 往前找最近的 function 定义
const pre = code.substring(0, b1);
const fnIdx = pre.lastIndexOf('function');
console.log('b1 @', b1, '前一个 function @', fnIdx);
// 从 fnIdx 括号匹配找到它的结束
let depth = 0, started = false;
let fnEnd = -1;
for (let i = fnIdx; i < code.length; i++) {
  const c = code[i];
  if (c === '{') { depth++; started = true; }
  else if (c === '}') { depth--; if (started && depth === 0) { fnEnd = i; break; } }
}
console.log('前一个 function 范围:', fnIdx, '→', fnEnd, '长度:', fnEnd - fnIdx);
console.log('b1 是否在 fnEnd 内:', b1 < fnEnd);
console.log('前一个 function 头:', code.substring(fnIdx, fnIdx + 300));
console.log('前一个 function 尾:', code.substring(fnEnd - 200, fnEnd));
// 找所有顶层 _$h7 引用（在 IIFE 顶层，即不在任何函数内）——先找 IIFE 顶层代码段
// IIFE 体从第一个 '(' 后开始。找 `})(_$_ts.scj` 前的顶层语句
// 更直接：找 `_$h7` 出现的所有位置，看是否在函数外
let idx = 0; const h7 = [];
while ((idx = code.indexOf('_$h7', idx + 1)) !== -1 && h7.length < 40) h7.push(idx);
console.log('\n_$h7 前40:', h7.join(','));
