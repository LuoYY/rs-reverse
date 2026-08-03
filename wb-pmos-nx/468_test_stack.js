/** 468 测试栈取元素兜底 patch */
const fs = require('fs');
const dynCode = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

let code = dynCode;
const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
if (re69.test(code)) code = code.replace(re69, '!$1?($2+=0):0;');
code = code.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) =>
  '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\[(\d+)\]\](?![=(])/g, (mm, obj, arr, num) =>
  '=((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\]\[/g, (mm, x, y) => '=((' + x + '[' + y + '])||__proxy())[');

// ★ 栈取元素兜底：=X[Y-1] → =(X[Y-1]||__proxy())
let scnt = 0;
code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)-1\](?![=(])/g, (mm, x, y) => {
  scnt++;
  return '=((' + x + '[' + y + '-1])||__proxy())';
});
console.log('stack -1 patch:', scnt);

code = code.replace(/while\(1\)\{/g, () => 'while(1){window.__w1=(window.__w1||0)+1;if(window.__all>15000000)throw new Error("L");window.__all=(window.__all||0)+1;');
try {
  new Function(code);
  console.log('✓ 语法合法');
} catch (e) {
  console.log('✗', e.message);
}
