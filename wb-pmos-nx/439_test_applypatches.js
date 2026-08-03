/** 439 测试 applyPatches 语法（文件方式避免 shell 转义） */
const fs = require('fs');
const dynCode = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

let code = dynCode;
const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
if (re69.test(code)) code = code.replace(re69, '!$1?($2+=0):0;');

let sc = 0;
code = code.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) => {
  sc++;
  return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
});
console.log('env safe:', sc);

let tc = 0;
for (const id of ['2331', '1689']) {
  code = code.replace(new RegExp('([_$\\w]+)\\(' + id + '\\,', 'g'), (mm, fn) => {
    tc++;
    return 'true';
  });
}
console.log('envTrue:', tc);

let gi = 0;
code = code.replace(/while\(1\)\{/g, () => {
  gi++;
  return 'while(1){window.__w' + gi + '=(window.__w' + gi + '||0)+1;window.__lastW=' + gi + ';if(window.__all>15000000)throw new Error("ALL_LOOP_w' + gi + '");window.__all=(window.__all||0)+1;';
});
console.log('while:', gi);

try {
  new Function(code);
  console.log('✓ 语法合法');
} catch (e) {
  console.log('✗ 语法错误:', e.message);
}
fs.writeFileSync('/tmp/nx_iter_test.js', code);
