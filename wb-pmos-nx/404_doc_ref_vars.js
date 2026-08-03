/**
 * 404_doc_ref_vars.js
 * 搜动态代码里 .documentElement/.all/.body 的访问（变量.属性）→ 找引用 document 的变量
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

console.log('=== .documentElement 访问 ===');
const re = /([_$\w]+)\.documentElement/g;
let m, count = 0;
while ((m = re.exec(code)) !== null) {
  count++;
  console.log(`#${count} ${m[1]}.documentElement @${m.index}:`, code.substring(Math.max(0, m.index - 80), m.index + 60).replace(/\n/g, ' '));
  if (count > 10) break;
}
console.log('总计:', count);

console.log('\n=== .all 访问 ===');
const re2 = /([_$\w]+)\.all\b/g;
count = 0;
while ((m = re2.exec(code)) !== null) {
  count++;
  console.log(`#${count} ${m[1]}.all @${m.index}:`, code.substring(Math.max(0, m.index - 60), m.index + 40).replace(/\n/g, ' '));
  if (count > 8) break;
}

console.log('\n=== .body 访问 ===');
const re3 = /([_$\w]+)\.body\b/g;
count = 0;
while ((m = re3.exec(code)) !== null) {
  count++;
  console.log(`#${count} ${m[1]}.body @${m.index}:`, code.substring(Math.max(0, m.index - 60), m.index + 40).replace(/\n/g, ' '));
  if (count > 8) break;
}

// 找引用 document 的变量（document 赋值给变量）
console.log('\n=== 变量 = document 或 window 相关 ===');
const re4 = /([_$\w]+)\s*=\s*document|([_$\w]+)\s*=\s*_$_x/g;
count = 0;
while ((m = re4.exec(code)) !== null) {
  count++;
  console.log(`#${count} @${m.index}:`, code.substring(Math.max(0, m.index - 40), m.index + 60).replace(/\n/g, ' '));
  if (count > 8) break;
}
