/**
 * 845_find_227_interpreter.js
 * 定位 opcode 227 所在的大解释器（不是 _$c4）
 * 关键：opcode 204/227 在 @249287 附近（另一个大函数）
 * 找到 _\$a2=window 所在函数（@249287）
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// _\$a2=window @254975，所在函数 @249287
// 检查 @249287 是什么
console.log('=== @249287 是什么 ===');
console.log(body.substring(249287, 249400));
console.log();

// 找 @249287 最近的函数定义
const fnStart = body.lastIndexOf('function', 249287);
console.log('最近函数 @', fnStart);
console.log(body.substring(fnStart, fnStart + 100));
console.log();

// 找该函数的完整范围
let depth = 0, end = fnStart;
for (let i = fnStart; i < body.length; i++) {
  if (body[i] === '{') depth++;
  else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
console.log('函数范围: [' + fnStart + '-' + end + '] size=' + (end - fnStart));
console.log('该函数含 opcode 204/227:', body.substring(fnStart, end).includes('_$jc===204'), body.substring(fnStart, end).includes('_$jc===227'));
console.log('该函数含 _\$a2=window:', body.substring(fnStart, end).includes('_\$a2=window'));
console.log('该函数名:');
const m = body.substring(fnStart, fnStart + 60).match(/function (_\$\w+)/);
console.log(m ? m[1] : '?');