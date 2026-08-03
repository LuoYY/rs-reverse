/** 477 找 _$dp 函数定义位置 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');
const idx = code.indexOf('function _$dp(');
console.log('function _$dp( @', idx);
if (idx >= 0) {
  console.log('上下文:', code.substring(idx - 60, idx + 120).replace(/\n/g, ' '));
  // 找 { 位置
  const open = code.indexOf('{', idx);
  console.log('{ @', open);
  console.log('{ 后 80:', code.substring(open, open + 80));
}
// 找所有内层 VM 函数定义
const re = /function\s+([_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
let m;
const fns = [];
while ((m = re.exec(code)) !== null) {
  const params = m[2].split(',').map(s => s.trim()).filter(Boolean);
  if (params.length === 4) fns.push({ name: m[1], at: m.index });
}
console.log('4 参数函数数:', fns.length);
console.log('位置分布:', fns.map(f => f.at).join(','));
