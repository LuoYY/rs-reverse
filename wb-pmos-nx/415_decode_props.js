/**
 * 415_decode_props.js
 * 解码反转的属性名（_$bm 数组）→ 找 documentMode 相关属性名
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

// 找 _$bm 数组定义
const arrIdx = code.indexOf('_$bm=[');
if (arrIdx < 0) { console.log('未找到 _$bm 数组'); process.exit(1); }
// 提取数组内容（到 ]）
let i = arrIdx + 5;
let depth = 1;
let arrStr = '';
while (i < code.length && depth > 0) {
  const c = code[i];
  if (c === '[') depth++;
  else if (c === ']') depth--;
  if (depth > 0) arrStr += c;
  i++;
}
console.log('=== _$bm 数组（部分）===');
console.log(arrStr.substring(0, 2000));

// 解析元素（字符串）
const elems = arrStr.match(/'([^']*)'/g).map(s => s.slice(1, -1));
console.log('\n=== 解码（反转）后 ===');
const decoded = elems.map(e => e.split('').reverse().join(''));
decoded.forEach((d, idx) => {
  if (d.includes('document') || d.includes('Mode') || d.includes('mode') || d.includes('Element') || d.includes('body') || d.includes('all') || d.includes('ready') || d.includes('Style') || d.includes('visible')) {
    console.log(`[${idx}] 原:'${elems[idx]}' → '${d}'`);
  }
});
console.log('\n总元素:', elems.length);
