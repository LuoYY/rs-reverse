/** 479 测试环境数组元素赋值兜底（_$f6=_$bl[0] → 兜底）语法 */
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
code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)-1\](?![=(])/g, (mm, x, y) => '=((' + x + '[' + y + '-1])||__proxy())');
code = code.replace(/(?<![=!<>])=([_$\w]+)\[--([_$\w]+)\](?![=(])/g, (mm, x, y) => '=((' + x + '[--' + y + '])||__proxy())');

// ★ 环境数组元素赋值兜底：=X[0]/[1]/[2]/[3]（函数开头 _$_j=_$dV._$$d,_$f6=_$bl[0] 等）
let ec = 0;
code = code.replace(/(?<![=!<>])=([_$\w]+)\[([0-3])\](?![=(])/g, (mm, x, n) => {
  ec++;
  return '=(((' + x + ')&&(' + x + ')[' + n + '])||__proxy())';
});
console.log('env arr patch:', ec);

code = code.replace(/while\(1\)\{/g, () => 'while(1){window.__w1=(window.__w1||0)+1;if(window.__all>15000000)throw new Error("L");window.__all=(window.__all||0)+1;');
try {
  new Function(code);
  console.log('✓ 语法合法');
} catch (e) {
  console.log('✗', e.message);
}
