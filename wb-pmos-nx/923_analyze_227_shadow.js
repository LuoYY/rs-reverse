/**
 * 923_analyze_227_shadow.js
 * 分析 opcode 227 所在函数，找到 _\$oU 的遮蔽问题
 * 关键：IIFE 顶层注入 var _$oU 可能被嵌套函数的 var _$oU 遮蔽
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// opcode 227 在 @255647（raw）
const target = 255647;
console.log('=== opcode 227 位置 @255647 ===');
console.log(body.substring(255640, 255660));
console.log();

// 找包含该位置的最内层函数
// 用括号匹配：从 0 开始找函数，检查是否包含 target
function findContainingFunc(pos) {
  let idx = 0;
  let best = null;
  while ((idx = body.indexOf('function ', idx)) >= 0) {
    const m = body.substring(idx, idx + 60).match(/function (_\$\w+)?/);
    // 找函数体范围
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

const func = findContainingFunc(target);
console.log('包含 opcode 227 的函数:', func ? func.name + ' [' + func.idx + '-' + func.end + ']' : '未找到');
if (func) {
  const fnBody = body.substring(func.idx, func.end);
  // 检查该函数的 var 声明
  const vars = fnBody.match(/var\s+_\$\w+/g);
  const oUVars = fnBody.match(/var\s+_\$oU/);
  console.log('该函数 var 声明数:', vars ? vars.length : 0);
  console.log('含 var _$oU:', oUVars ? '是（遮蔽）' : '否');
  // 检查该函数内 _\$oU 的赋值
  let idx = 0, count = 0;
  while ((idx = fnBody.indexOf('_\$oU=', idx)) >= 0) {
    console.log('  _\$oU= @' + (func.idx + idx) + ': ' + fnBody.substring(idx - 20, idx + 40).replace(/\n/g, ' '));
    idx += 4;
    count++;
    if (count > 10) break;
  }
  console.log('该函数内 _\$oU= 赋值数:', count);
  // 检查该函数前是否有 _\$oU 赋值（opcode 204 或 725）
  // 找 opcode 204 的位置
  const op204 = func.idx + fnBody.indexOf('_$a2=window');
  console.log('opcode 204 (_$a2=window) @', op204, '在 227 前?', op204 < target);
  // 找 opcode 725 的位置
  const op725 = func.idx + fnBody.indexOf('_$oU=_$kB[0]');
  console.log('opcode 725 (_$oU=_$kB[0]) @', op725, '在 227 前?', op725 > 0 && op725 < target);
}