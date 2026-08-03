/** 429 语法错误精确定位 */
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

let runCode = code;
const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
if (re69.test(runCode)) runCode = runCode.replace(re69, '!$1?($2+=0):0;');
runCode = runCode.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) =>
  '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
let callCnt = 0;
runCode = runCode.replace(/([_$\w]+)\[([_$\w]+)\[(\d+)\]\]\(/g, (mm, obj, arr, num) => {
  callCnt++;
  return '(' + obj + ')[(' + arr + ')[' + num + ']]&&(' + obj + ')[(' + arr + ')[' + num + ']](';
});
console.log('call patch:', callCnt);

try {
  new vm.Script(runCode, { filename: 'test.js' });
  console.log('✓ 语法合法');
} catch (e) {
  console.log('✗', e.message);
  // vm.Script 错误带 start/end 位置
  if (e.stack) {
    const m = e.stack.match(/test\.js:(\d+)/);
    if (m) {
      const line = +m[1];
      // 代码压缩可能单行，看错误附近的换行
      const lines = runCode.split('\n');
      if (lines[line - 1] !== undefined) {
        const l = lines[line - 1];
        console.log('错误行 len:', l.length);
        // 找该行的 call patch 痕迹
        const i = l.indexOf('&&');
        // 打印错误行片段（分段）
        for (let s = 0; s < Math.min(l.length, 300); s += 150) {
          console.log('...', l.substring(s, s + 150));
        }
      } else {
        console.log('行号超出:', line, '总行数:', lines.length);
      }
    } else {
      console.log('stack:', e.stack.substring(0, 300));
    }
  }
}
