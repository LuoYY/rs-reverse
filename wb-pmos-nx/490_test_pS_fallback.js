/** 490 测试 4 参数函数入口兜底第 4 参数（_$pS 环境数组） */
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
code = code.replace(/(?<![=!<>])=([_$\w]+)\[([0-3])\](?![=(])/g, (mm, x, n) => '=(((' + x + ')&&(' + x + ')[' + n + '])||__proxy())');

// ★ 4 参数函数入口兜底第 4 参数（环境数组 → __proxy 数组）
let fc = 0;
code = code.replace(/(function\s+([_$][\w$]*)\s*\(([_$][\w$]+),([_$][\w$]+),([_$][\w$]+),([_$][\w$]+)\)\{)([^]{0,250})/g, (mm, head, fn, p1, p2, p3, p4, body) => {
  if (!body.includes(p1 + '._') && !body.includes(p1 + '[')) return mm;
  fc++;
  return head + 'if(' + p4 + '===void 0||' + p4 + '===null){' + p4 + '=[__proxy(),__proxy(),__proxy(),__proxy()];}' + body;
});
console.log('pS fallback patch:', fc);

code = code.replace(/while\(1\)\{/g, () => 'while(1){window.__w1=(window.__w1||0)+1;if(window.__all>15000000)throw new Error("L");window.__all=(window.__all||0)+1;');
try {
  new Function(code);
  console.log('✓ 语法合法');
} catch (e) {
  console.log('✗', e.message);
}
