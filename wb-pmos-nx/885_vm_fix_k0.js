/**
 * 885_vm_fix_k0.js
 * 修复 _\$kB 问题：opcode 725 前 _\$kB 未初始化
 * 关键：_\$kB 应由 opcode 1685 初始化（_$k0=_$nP(_$ez) 后）
 * 但 opcode 725 在 aebi[1] 位置 12（早期）
 * 浏览器中 opcode 725 时 _\$kB 已有值
 * 可能：_\$kB 由 _\$c1 的 _\$pL 参数初始化
 * 或：_\$kB 是 _\$gq 的闭包变量，浏览器中 _\$gq 调用前已初始化
 * 检查 _\$gq 的调用（opcode 725 在 _\$gq 内）
 * 但 _\$gq 是函数（470B），opcode 725 在 @345686（不在 _\$gq 范围）
 * 需重新定位 opcode 725 的真实函数
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// opcode 725 @345686，精确找函数
// 用更精确的括号匹配
const start = 345686;
let fnStart = -1;
// 从 345686 向前找最近的 { 匹配的 function
// 用简单方式：找最近的 function 关键字
let search = start;
while (search > 0) {
  const f = body.lastIndexOf('function', search);
  if (f < 0) break;
  // 检查该 function 是否包含 345686（括号匹配）
  let depth = 0, end = f;
  let contains = false;
  for (let i = f; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    if (i === start) { contains = true; break; }
  }
  if (contains) {
    fnStart = f;
    console.log('包含 opcode 725 的函数 @', f);
    console.log(body.substring(f, f + 100));
    break;
  }
  search = f - 1;
}

if (fnStart >= 0) {
  // 找函数范围
  let depth = 0, end = fnStart;
  for (let i = fnStart; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  console.log('函数范围: [' + fnStart + '-' + end + '] size=' + (end - fnStart));
  const fnBody = body.substring(fnStart, end);
  const m = fnBody.match(/\$lP\[(\d+)\]/g);
  console.log('_\$lP 引用:', m ? m.join(', ') : '无');
  const m2 = fnBody.match(/\$pW=\$lP\[(\d+)\]/g);
  console.log('_\$pW 流:', m2 ? m2.join(', ') : '无');
  // 找 _\$kB 初始化
  const kb = fnBody.indexOf('_\$kB=_$pL[0]');
  console.log('_\$kB=_$pL[0] @', kb >= 0 ? fnStart + kb : -1);
  // 找 opcode 725 前 _\$kB 赋值
  const before725 = fnBody.substring(0, 345686 - fnStart);
  const kbAssigns = [];
  let i = 0;
  while ((i = before725.indexOf('_\$kB=', i)) >= 0) {
    kbAssigns.push(before725.substring(i - 20, i + 30).replace(/\n/g, ' '));
    i += 4;
  }
  console.log('725 前 _\$kB 赋值（' + kbAssigns.length + '）:');
  kbAssigns.slice(-5).forEach(a => console.log('  ' + a));
}