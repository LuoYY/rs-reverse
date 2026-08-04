/**
 * 861_find_227_handler.js
 * 定位包含 opcode 227 处理（_$a2[_$oU[88]]）的函数
 * 确认 VM 入口和 _\$kB 初始化
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 1. 找包含 _\$a2[_$oU[88]] 的函数
const target = '_$a2[_$oU[88]]';
const tIdx = body.indexOf(target);
console.log('_\$a2[_$oU[88]] @', tIdx);
if (tIdx >= 0) {
  // 找所在函数
  const fnStart = body.lastIndexOf('function', tIdx);
  console.log('所在函数 @', fnStart);
  const fnMatch = body.substring(fnStart, fnStart + 60).match(/function (_\$\w+)/);
  console.log('函数名:', fnMatch ? fnMatch[1] : '?');
  // 找函数范围
  let depth = 0, end = fnStart;
  for (let i = fnStart; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  console.log('函数范围: [' + fnStart + '-' + end + '] size=' + (end - fnStart));
  // 检查该函数是否含 opcode 204（_$a2=window）
  const fnBody = body.substring(fnStart, end);
  console.log('含 _\$a2=window:', fnBody.includes('_\$a2=window'));
  console.log('含 _\$jc===204:', fnBody.includes('_$jc===204'));
  console.log('含 _\$jc===227:', fnBody.includes('_$jc===227'));
  // 检查该函数的程序流（_$lP[X]）
  const m = fnBody.match(/\$lP\[(\d+)\]/g);
  console.log('程序流引用:', m ? m.join(', ') : '无');
}

// 2. 找 _\$kB 初始化（opcode 10: _$kB=_$pL[0]）
console.log('\n=== _\$kB 初始化 ===');
const kbInit = body.indexOf('_\$kB=_$pL[0]');
console.log('_\$kB=_$pL[0] @', kbInit);
if (kbInit >= 0) {
  const ctx = body.substring(kbInit - 50, kbInit + 50).replace(/\n/g, ' ');
  console.log('上下文:', ctx);
}

// 3. 检查 opcode 725（_$oU=_$kB[0]）所在函数
const op725 = body.indexOf('_\$oU=_$kB[0]');
console.log('\nopcode 725 (_$oU=_$kB[0]) @', op725);
if (op725 >= 0) {
  const fnStart = body.lastIndexOf('function', op725);
  const fnMatch = body.substring(fnStart, fnStart + 60).match(/function (_\$\w+)/);
  console.log('所在函数:', fnMatch ? fnMatch[1] : '?', '@', fnStart);
  // 该函数是否在 opcode 10 初始化后
  console.log('opcode 10 在 725 前:', kbInit < op725);
  console.log('opcode 10 和 725 同函数:', kbInit >= fnStart && op725 < fnStart + 1000000);
}