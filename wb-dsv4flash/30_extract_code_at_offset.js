/**
 * 30_extract_code_at_offset.js
 *
 * 从动态代码文本中提取 plain24 构造调用链的源码：
 *   _$dP @3:82767 → _$kg @3:83853 → _$ft @3:65698 → _$al @3:60803
 * 定位 prefix（keys2 XOR mask）的计算代码
 */
const fs = require('fs');
const path = require('path');

const dyn = fs.readFileSync(path.join(__dirname, '..', 'output/capture-20080/extracted-dyn-code.js'), 'utf8');
console.log('动态代码长度:', dyn.length);

// 从浏览器捕获的动态代码（当前会话）也可以，但用已保存的
// 注意：浏览器 eval 的动态代码与 extracted-dyn-code.js 可能不同（nsd/cd 不同）
// 先用 extracted-dyn-code.js 看结构

function showAround(offset, label, len) {
  const start = Math.max(0, offset - 60);
  const end = Math.min(dyn.length, offset + (len || 500));
  console.log(`\n=== ${label} @${offset} ===`);
  console.log(dyn.substring(start, end));
}

// 提取关键函数定义：搜索这些偏移附近的函数边界
// 先找 _$dP / _$$n 函数
showAround(82767, '_$dP (slice 构造点)');
showAround(83853, '_$kg (调用方)');

// 找函数定义（向前找 "function "）
function findFunctionStart(offset) {
  let idx = offset;
  while (idx > 0) {
    const fIdx = dyn.lastIndexOf('function', idx);
    if (fIdx < 0) break;
    // 检查函数体是否包含 offset
    const closeIdx = dyn.indexOf('}', fIdx);
    if (closeIdx >= offset) return fIdx;
    idx = fIdx - 1;
  }
  return -1;
}

for (const [off, label] of [[82767, '_$dP'], [83853, '_$kg'], [65698, '_$ft'], [60803, '_$al'], [65555, '_$ft-2']]) {
  const fStart = findFunctionStart(off);
  console.log(`\n=== ${label} 函数定义 @${fStart}（包含 @${off}）===\n`);
  if (fStart > 0) {
    // 打印函数前 100 字符找名字
    const namePart = dyn.substring(fStart, Math.min(dyn.length, fStart + 120));
    console.log('函数头:', namePart.substring(0, 120));
  }
}

process.exit(0);
