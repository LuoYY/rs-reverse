/** 440 二分定位语法错误来源 */
const fs = require('fs');
const dynCode = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

function check(label, code) {
  try { new Function(code); console.log(label + ': ✓'); return true; }
  catch (e) { console.log(label + ': ✗ ' + e.message); return false; }
}

// 1. 原始
check('原始', dynCode);
// 2. 只 op69
let c1 = dynCode;
const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
if (re69.test(c1)) c1 = c1.replace(re69, '!$1?($2+=0):0;');
check('op69', c1);
// 3. + env safe
let c2 = c1;
c2 = c2.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) =>
  '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
check('+envSafe', c2);
// 4. + 2331
let c3 = c2;
c3 = c3.replace(new RegExp('([_$\\w]+)\\(' + '2331' + '\\,', 'g'), () => 'true');
check('+2331', c3);
// 5. + 1689
let c4 = c3;
c4 = c4.replace(new RegExp('([_$\\w]+)\\(' + '1689' + '\\,', 'g'), () => 'true');
check('+1689', c4);
// 6. + while
let c5 = c4;
c5 = c5.replace(/while\(1\)\{/g, () => 'while(1){window.__w1=(window.__w1||0)+1;if(window.__all>15000000)throw new Error("L");window.__all=(window.__all||0)+1;');
check('+while', c5);
