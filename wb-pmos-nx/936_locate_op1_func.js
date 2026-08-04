/**
 * 936_locate_op1_func.js
 * 精确定位 opcode 1（@296143）所在函数
 * 关键：_\$cM 和 _\$kB 是该函数的局部变量
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// opcode 1 @296143，找所在函数
const op1 = 296143;
// 用括号匹配找最内层函数
function findContainingFunc(pos) {
  let idx = 0;
  let best = null;
  while ((idx = body.indexOf('function ', idx)) >= 0) {
    const m = body.substring(idx, idx + 60).match(/function (_\$\w+)?/);
    const brace = body.indexOf('{', idx);
    if (brace < 0) { idx += 9; continue; }
    let depth = 0, end = -1;
    for (let i = brace; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end > 0 && pos >= idx && pos < end) {
      if (!best || (idx > best.idx && end < best.end)) {
        best = { idx, end, name: m ? m[1] : 'anon' };
      }
    }
    idx += 9;
  }
  return best;
}

const func = findContainingFunc(op1);
console.log('opcode 1 所在函数:', func ? func.name + ' [' + func.idx + '-' + func.end + ']' : '未找到');
if (func) {
  // 找函数参数
  console.log('函数参数:', body.substring(func.idx, func.idx + 120));
  // 找 _\$cM 在该函数的初始
  const fnBody = body.substring(func.idx, func.end);
  const varCM = fnBody.indexOf('var _$cM');
  const varKB = fnBody.indexOf('var _$kB');
  console.log('var _$cM @', varCM >= 0 ? func.idx + varCM : -1);
  console.log('var _$kB @', varKB >= 0 ? func.idx + varKB : -1);
  if (varCM >= 0) console.log('var _$cM ctx:', fnBody.substring(varCM - 10, varCM + 40).replace(/\n/g, ' '));
  if (varKB >= 0) console.log('var _$kB ctx:', fnBody.substring(varKB - 10, varKB + 40).replace(/\n/g, ' '));
  // 找 _\$cM 的所有赋值（该函数内）
  let idx = 0, count = 0;
  while ((idx = fnBody.indexOf('_\$cM=', idx)) >= 0) {
    console.log('_\$cM= @' + (func.idx + idx) + ': ' + fnBody.substring(idx - 20, idx + 50).replace(/\n/g, ' '));
    idx += 4;
    count++;
    if (count > 10) break;
  }
  console.log('_\$cM= 赋值数:', count);
  // 找 _\$aW
  const aWIdx = fnBody.indexOf('_\$aW');
  console.log('_\$aW 引用 @', aWIdx >= 0 ? func.idx + aWIdx : -1);
}