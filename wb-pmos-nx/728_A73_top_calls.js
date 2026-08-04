const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// IIFE 体从 @10 开始。找顶层（函数外）代码：定位所有 '}' 后紧跟非 function 的语句
// 更简单：找几个已知的顶层执行模式
// 1. _\$bX 被调用（_\$bX 定义在 @7448，调用在 @7457 是自身定义？）
// 2. window['$_ts'] 赋值
// 3. _$l9（scj）/_$_s（aebi）在顶层使用
// 搜索 '@10' 开始的 IIFE 体里 ';' 结尾且不在函数内的语句——用括号深度分析
// 方法：扫描整个 IIFE 体，维护深度，记录深度==1 时的语句片段（顶层）
let depth = 0;
const topStmts = [];
let cur = '';
for (let i = 20; i < code.length; i++) {  // 跳过 (function(_$l9,_$_s){ 
  const c = code[i];
  cur += c;
  if (c === '{') depth++;
  else if (c === '}') { depth--; }
  if (c === ';' && depth === 0 && cur.trim().length > 0 && !cur.trim().startsWith('function ')) {
    topStmts.push(cur.trim().substring(0, 200));
    cur = '';
  }
}
console.log('顶层语句数:', topStmts.length);
topStmts.forEach((s, i) => console.log(`${i}: ${s}`));
