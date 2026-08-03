/** 428 语法测试2：极简 call patch 语法验证 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');
console.log('raw len:', code.length);

let runCode = code;
// op69
const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
if (re69.test(runCode)) {
  runCode = runCode.replace(re69, '!$1?($2+=0):0;');
  console.log('op69 patched');
}
// env patch（记录真实属性名）
let envCnt = 0;
runCode = runCode.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) => {
  envCnt++;
  return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
});
console.log('env patch:', envCnt);
// call patch 极简：X[Y[N]]( → X[Y[N]]&&X[Y[N]](
let callCnt = 0;
runCode = runCode.replace(/([_$\w]+)\[([_$\w]+)\[(\d+)\]\]\(/g, (mm, obj, arr, num) => {
  callCnt++;
  return '(' + obj + ')[(' + arr + ')[' + num + ']]&&(' + obj + ')[(' + arr + ')[' + num + ']](';
});
console.log('call patch:', callCnt);

// 语法检查
try {
  new Function(runCode);
  console.log('✓ 语法合法');
} catch (e) {
  console.log('✗ 语法错误:', e.message);
}
fs.writeFileSync('/tmp/nx_dyncode_safe.js', runCode);
console.log('saved');
