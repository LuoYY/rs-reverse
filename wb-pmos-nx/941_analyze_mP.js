/**
 * 941_analyze_mP.js
 * 找 _\$mP 的初始化（opcode 724 用它切 196 块）
 * 关键：_\$mP 是原始字符串表数据，由某 opcode 初始化
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');
const c4Idx = body.indexOf('function _$c4');
const c4 = body.substring(c4Idx, c4Idx + 300000);

// 找 _\$mP 赋值（_$c4 内）
console.log('=== _\$mP 赋值（_$c4 内） ===');
let idx = 0, count = 0;
while ((idx = c4.indexOf('_\$mP=', idx)) >= 0) {
  console.log('@' + (c4Idx + idx) + ': ' + c4.substring(idx - 30, idx + 50).replace(/\n/g, ' ').substring(0, 80));
  idx += 4;
  count++;
  if (count > 15) break;
}
console.log('_\$mP= 赋值数:', count);

// 找 _\$mP 的 var 声明
console.log('\n=== _\$mP var 声明 ===');
const varMP = c4.indexOf('var _$mP');
console.log('var _$mP @', varMP >= 0 ? c4Idx + varMP : -1);

// 找 _\$mP 在 IIFE 顶层
console.log('\n=== IIFE 顶层 _\$mP ===');
const top = body.substring(0, c4Idx);
const topMP = top.indexOf('_\$mP');
console.log('IIFE 顶层 _\$mP @', topMP >= 0 ? topMP : -1);
if (topMP >= 0) console.log('ctx:', top.substring(topMP - 40, topMP + 40).replace(/\n/g, ' '));

// 找 _\$mP 的初始化 opcode（可能在 _\$c4 主循环外）
console.log('\n=== _\$mP 全局搜索（非 _\$c4） ===');
idx = 0;
count = 0;
while ((idx = body.indexOf('_\$mP=', idx)) >= 0) {
  const ctx = body.substring(idx - 40, idx + 60).replace(/\n/g, ' ');
  // 找所在函数
  const fnStart = body.lastIndexOf('function', idx);
  const fnMatch = body.substring(fnStart, fnStart + 60).match(/function (_\$\w+)/);
  console.log('@' + idx + ' fn=' + (fnMatch ? fnMatch[1] : '?') + ': ' + ctx.substring(0, 80));
  idx += 4;
  count++;
  if (count > 20) break;
}

// 找 _\$mP 的使用（opcode 724 外）
console.log('\n=== _\$mP 使用 ===');
idx = 0;
count = 0;
while ((idx = c4.indexOf('_\$mP', idx)) >= 0) {
  const ctx = c4.substring(idx - 30, idx + 30).replace(/\n/g, ' ');
  console.log('@' + (c4Idx + idx) + ': ' + ctx.substring(0, 60));
  idx += 4;
  count++;
  if (count > 15) break;
}