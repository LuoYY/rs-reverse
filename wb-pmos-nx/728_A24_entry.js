const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找顶层执行代码：IIFE 体内、函数外的语句（不以 function 开头，不在函数体内）
// 方法：找所有 "_$iA(" 顶层调用 / "_$bX(" 调用
for (const pat of ['_$iA(', '_$bX(', '_$b1(', ';})']) {
  let idx = 0; const occ = [];
  while ((idx = code.indexOf(pat, idx + 1)) !== -1 && occ.length < 15) occ.push(idx);
  console.log(`${pat} 出现:`, occ.join(','));
}
// 关键：找到主体执行段。搜索 `_$_s` / `_$l9` 参数使用
console.log('\n=== _$_s 引用（前 10） ===');
let idx = 0; const s = [];
while ((idx = code.indexOf('_$_s', idx + 1)) !== -1 && s.length < 10) s.push(idx);
for (const i of s) console.log(`@${i}:`, code.substring(Math.max(0, i - 100), i + 150).replace(/\n/g, ' '));
console.log('\n=== _$l9 引用（前 10） ===');
idx = 0; const l9 = [];
while ((idx = code.indexOf('_$l9', idx + 1)) !== -1 && l9.length < 10) l9.push(idx);
for (const i of l9) console.log(`@${i}:`, code.substring(Math.max(0, i - 100), i + 150).replace(/\n/g, ' '));
