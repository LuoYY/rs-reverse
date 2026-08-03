/**
 * 400_search_dm_str.js
 * 搜动态代码里 documentMode 字符串（带引号/拼接/数组）+ document 属性名数组
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_envfull.js', 'utf8');

// 带引号的 documentMode
for (const q of ["'documentMode'", '"documentMode"', '`documentMode`']) {
  const n = code.split(q).length - 1;
  if (n > 0) console.log(q, '出现:', n);
}

// 拼接 'document'+'Mode'
const concat = code.match(/['"]document['"]\s*\+/g);
console.log("'document'+ 拼接:", concat ? concat.length : 0);

// documentElement 字面量（对比）
for (const q of ["'documentElement'", '"documentElement"', "'documentMode'", "'compatMode'", "'doScroll'", "'all'", "'body'", "'cookie'", "'userAgent'", "'navigator'"]) {
  const n = code.split(q).length - 1;
  console.log(q, ':', n);
}

// 所有含 'document' 的字符串字面量
console.log('\n=== 含 document 的字符串 ===');
const strs = code.match(/['"][^'"]*document[^'"]*['"]/g);
console.log(strs ? strs.slice(0, 20) : '无');

// documentMode 通过变量（X['doc'+...] 无法静态找）——搜 .documentMode 点访问
console.log('\n=== .documentMode 直接访问 ===');
const dot = code.match(/[^'"][_$\w]+\.documentMode/g);
console.log(dot ? dot.slice(0, 10) : '无');
