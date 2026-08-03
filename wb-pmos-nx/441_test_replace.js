/** 441 测试括号匹配替换 */
const fs = require('fs');
const dynCode = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

function replaceIdCalls(code, id) {
  const re = new RegExp('([_$\\w]+)\\(' + id + '\\,', 'g');
  let out = '', last = 0, m, tc = 0;
  while ((m = re.exec(code)) !== null) {
    const openPos = re.lastIndex - 1;
    let depth = 0, end = -1;
    for (let k = openPos; k < code.length; k++) {
      if (code[k] === '(') depth++;
      else if (code[k] === ')') { depth--; if (depth === 0) { end = k; break; } }
    }
    if (end < 0) break;
    out += code.slice(last, m.index) + 'true';
    last = end + 1;
    re.lastIndex = end + 1;
    tc++;
  }
  out += code.slice(last);
  return { out, tc };
}

let code = dynCode;
const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
if (re69.test(code)) code = code.replace(re69, '!$1?($2+=0):0;');
code = code.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) =>
  '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
let r;
r = replaceIdCalls(code, '2331');
code = r.out; console.log('2331 → true:', r.tc);
r = replaceIdCalls(code, '1689');
code = r.out; console.log('1689 → true:', r.tc);
code = code.replace(/while\(1\)\{/g, () => 'while(1){window.__w1=(window.__w1||0)+1;if(window.__all>15000000)throw new Error("L");window.__all=(window.__all||0)+1;');
try {
  new Function(code);
  console.log('✓ 语法合法');
} catch (e) {
  console.log('✗', e.message);
}
fs.writeFileSync('/tmp/nx_iter_test.js', code);
