/** 430 分析 nsd=91570 代码的环境检测函数（_$pz 类巨型函数）与 2331 调用 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_pzbypass.js', 'utf8');
console.log('len:', code.length);

// 1. 找 (2331, 调用
console.log('\n=== (2331, 调用点 ===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('(2331,', idx)) !== -1) {
  cnt++;
  console.log('#' + cnt + ' @' + idx + ': ' + code.substring(Math.max(0, idx - 50), idx + 50).replace(/\n/g, ' '));
  idx += 6;
}
console.log('调用数:', cnt);

// 2. 找巨型函数（函数体 > 20000）
console.log('\n=== 巨型函数（>20000 字符）===');
const fnRe = /function\s+([_$]\w+)\s*\(/g;
let m, big = [];
while ((m = fnRe.exec(code)) !== null) {
  // 找函数体长度
  const open = code.indexOf('{', m.index);
  if (open < 0) continue;
  let stack = 0, end = -1;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  if (end < 0) continue;
  const len = end - m.index;
  if (len > 20000) {
    big.push({ name: m[1], len, at: m.index });
    console.log(m[1] + ': ' + len + ' @' + m.index);
  }
}
console.log('巨型函数数:', big.length);

// 3. 找 2331 调用的函数名（_$pz 之类）— 从调用点往前找最近的函数定义
if (cnt > 0) {
  const first = code.indexOf('(2331,');
  // 往前找最近的一个 function X( 或 X=function
  let seg = code.substring(0, first);
  const backRe = /function\s+([_$]\w+)\s*\(/g;
  let bm, lastName = '?';
  while ((bm = backRe.exec(seg)) !== null) lastName = bm[1];
  console.log('\n2331 调用前最近函数:', lastName);
  // 找 lastName 定义体
  const fIdx = code.lastIndexOf('function ' + lastName + '(', first);
  if (fIdx >= 0) {
    const open = code.indexOf('{', fIdx);
    let stack = 0, end = -1;
    for (let i = open; i < code.length; i++) {
      if (code[i] === '{') stack++;
      else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
    }
    console.log(lastName + ' 体: ' + (end - fIdx) + ' chars');
  }
}
