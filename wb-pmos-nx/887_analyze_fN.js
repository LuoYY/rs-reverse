/**
 * 887_analyze_fN.js
 * 分析 _$fN 函数（charCodeAt 错误）
 * 关键：_\$fN 读 _\$b1 表（字符串表），但 _\$b1 元素不是字符串
 * 检查捕获的 _\$b1 表内容
 */
const fs = require('fs');
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));

// 检查 _\$b1 表
console.log('=== _\$b1 表 ===');
const b1 = tables['_$b1'].val;
console.log('_\$b1 len:', b1.length);
console.log('_\$b1 前 30:', JSON.stringify(b1.slice(0, 30)));
console.log('_\$b1 类型分布:', b1.reduce((acc, v) => { const t = typeof v; acc[t] = (acc[t] || 0) + 1; return acc; }, {}));

// 检查 _\$lc 表
console.log('\n=== _\$lc 表 ===');
const lc = tables['_$lc'].val;
console.log('_\$lc len:', lc.length);
console.log('_\$lc 前 30:', JSON.stringify(lc.slice(0, 30)));

// 检查 _\$oU 表
console.log('\n=== _\$oU 表 ===');
const oU = tables['_$oU'].val;
console.log('_\$oU len:', oU.length);
console.log('_\$oU 前 30:', JSON.stringify(oU.slice(0, 30)));

// 检查 _\$fN 需要的字符串
console.log('\n=== _\$fN 函数（charCodeAt） ===');
// _$fN 在 IIFE 中 @19386 附近
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');
const fNIdx = body.indexOf('function _$fN');
console.log('_\$fN @', fNIdx);
if (fNIdx >= 0) {
  console.log(body.substring(fNIdx, fNIdx + 400));
}