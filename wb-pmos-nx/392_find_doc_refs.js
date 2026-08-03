/**
 * 392_find_doc_refs.js
 * 搜索动态代码里 document/navigator 的引用（环境采集函数），定位 documentMode 读取
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_envfull.js', 'utf8');

console.log('=== document 直接引用 ===');
let idx = 0, count = 0;
while ((idx = code.indexOf('document', idx)) !== -1) {
  count++;
  const ctx = code.substring(Math.max(0, idx - 60), idx + 80).replace(/\n/g, ' ');
  // 只打印可能的属性访问
  if (/document[\.\[]|typeof document|document\)/.test(ctx)) {
    console.log(`#${count} @${idx}: ${ctx}`);
  }
  idx += 8;
  if (count > 40) break;
}
console.log('document 出现:', count);

console.log('\n=== navigator 直接引用（前 20）===');
idx = 0; count = 0;
while ((idx = code.indexOf('navigator', idx)) !== -1) {
  count++;
  const ctx = code.substring(Math.max(0, idx - 60), idx + 80).replace(/\n/g, ' ');
  if (/navigator[\.\[]/.test(ctx)) {
    console.log(`#${count} @${idx}: ${ctx}`);
  }
  idx += 9;
  if (count > 20) break;
}
