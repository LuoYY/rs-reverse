// 从 nx 外层 JS 提取 cp2（240 大数常量表，xj 的 cp2_dump.json 格式）
const fs = require('fs');
const path = require('path');
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const jscode = fs.readFileSync(OUTER_JS, 'utf8');

// 找 `[46,32768,255,-1,...]` 这类数字数组（瑞数全局常量）
// 模式：数组含 2^15, 2^24, -1, 2^8 等特殊值
const patterns = [];
// 匹配 [数字,数字,...] 且含特殊值
const re = /\[([0-9,\-\. ]{100,})\]/g;
let m;
while ((m = re.exec(jscode))) {
  const inner = m[1];
  const nums = inner.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  if (nums.length >= 100 && (nums.includes(32768) || nums.includes(65536) || nums.includes(-1) || nums.includes(33554432))) {
    patterns.push({ len: nums.length, head: nums.slice(0, 10), special: nums.filter(n => n > 10000 || n < 0).slice(0, 5) });
  }
}
console.log('候选数组:', patterns.length);
patterns.forEach((p, i) => console.log(`[${i}] len=${p.len} head=${p.head} special=${JSON.stringify(p.special)}`));
if (patterns.length) {
  // 取最像的（240 附近 或 特殊值多）
  const best = patterns.filter(p => Math.abs(p.len - 240) < 50)[0] || patterns[0];
  console.log('\n选用:', JSON.stringify(best));
}
