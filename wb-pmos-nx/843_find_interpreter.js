/**
 * 843_find_interpreter.js
 * 定位 opcode 分发的大解释器函数（含 _$a2 的赋值/读取）
 * 关键：_$c4 可能是 trampoline，真正的大解释器是另一个函数
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 1. 找所有 function _$a2 出现（opcode 204 赋值和 227 读取）
console.log('=== _\$a2 的赋值/读取位置 ===');
let idx = 0, count = 0;
while ((idx = body.indexOf('_\$a2[', idx)) >= 0 && count < 20) {
  // 找所在函数
  const fnStart = body.lastIndexOf('function', idx);
  const fnMatch = body.substring(fnStart, fnStart + 60).match(/function (_\$\w+)/);
  console.log('_\$a2[ @' + idx + ' 函数=' + (fnMatch ? fnMatch[1] : '?') + ' @' + fnStart);
  idx += 4;
  count++;
}

// 2. 找 _\$a2=window 赋值所在函数
console.log('\n=== _\$a2=window 赋值位置 ===');
idx = 0;
while ((idx = body.indexOf('_\$a2=window', idx)) >= 0) {
  const fnStart = body.lastIndexOf('function', idx);
  const fnMatch = body.substring(fnStart, fnStart + 60).match(/function (_\$\w+)/);
  console.log('_\$a2=window @' + idx + ' 函数=' + (fnMatch ? fnMatch[1] : '?') + ' @' + fnStart);
  idx += 4;
}

// 3. 找出所有大函数（>100KB）
console.log('\n=== 所有大函数 ===');
const funcs = [];
let fi = 0;
while ((fi = body.indexOf('function ', fi)) >= 0) {
  const nameMatch = body.substring(fi, fi + 60).match(/function (_\$\w+)/);
  let depth = 0, end = fi;
  for (let i = fi; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const size = end - fi;
  if (size > 10000) {
    funcs.push({ name: nameMatch ? nameMatch[1] : '?', pos: fi, size });
  }
  fi += 9;
}
funcs.sort((a, b) => b.size - a.size);
funcs.slice(0, 10).forEach(f => console.log(f.name + ' @' + f.pos + ' size=' + f.size));