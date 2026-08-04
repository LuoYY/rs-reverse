/**
 * 888_vm_fix_fN.js
 * 修复 _$fN 错误：_$aq.charCodeAt is not a function
 * 关键：_\$fN 读 _\$b1 表，但 _\$b1 某些元素不是字符串（是数组/对象）
 * _$fN 将 _\$b1[?] 作为字符串调用 charCodeAt
 * 但捕获的 _\$b1 表有 196 个字符串，元素类型正常
 * 可能：_\$fN 被调用时传入的不是 _\$b1 元素（是 _\$oU 或 _\$lc 的元素）
 * 或：_\$fN 的输入是 _\$b1 的"解码后"值（_$oX 是解码器）
 * 检查：_\$fN 的调用点（_$nP 内）
 * 实际错误：at _$fN (19386) at _$nP (20339) at _$c4 (29788)
 * _$nP 是 _\$k0 生成器（opcode 1685）
 * _$nP 调用 _$fN 生成 _\$k0 表
 * _$fN 输入是 _\$b1 的某个元素（解码）
 * 但错误 _$aq.charCodeAt 不是函数 → 输入不是字符串
 * 可能：_\$b1 表元素被截断（捕获时签名化）
 * 检查捕获的 _\$b1 是否完整字符串
 */
const fs = require('fs');
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));

// 检查 _\$b1 所有元素类型
const b1 = tables['_$b1'].val;
console.log('_\$b1 全为字符串:', b1.every(v => typeof v === 'string'));
// 找非字符串
const nonStr = b1.map((v, i) => typeof v !== 'string' ? i : -1).filter(i => i >= 0);
console.log('非字符串元素:', nonStr);

// 检查 _\$oU 所有元素
const oU = tables['_$oU'].val;
console.log('_\$oU 全为字符串:', oU.every(v => typeof v === 'string'));
const nonStr2 = oU.map((v, i) => typeof v !== 'string' ? i : -1).filter(i => i >= 0);
console.log('_\$oU 非字符串元素:', nonStr2);

// 检查 _\$lc
const lc = tables['_$lc'].val;
console.log('_\$lc 全为字符串:', lc.every(v => typeof v === 'string'));
const nonStr3 = lc.map((v, i) => typeof v !== 'string' ? i : -1).filter(i => i >= 0);
console.log('_\$lc 非字符串元素:', nonStr3);

// 关键：_\$fN 的输入是 _\$b1[9]（"function "）等
// 但错误 _$aq.charCodeAt
// 可能：_\$nP 调用 _$fN 时传入 _\$b1 的某个元素
// 但那个元素是 undefined（捕获不完整）
// 检查 _\$b1 的 undefined
console.log('\n_\$b1 undefined 元素:', b1.map((v, i) => v === undefined ? i : -1).filter(i => i >= 0));
console.log('_\$oU undefined 元素:', oU.map((v, i) => v === undefined ? i : -1).filter(i => i >= 0));
console.log('_\$lc undefined 元素:', lc.map((v, i) => v === undefined ? i : -1).filter(i => i >= 0));

// 检查 _\$k0 生成（opcode 1685 = _$nP）
// _$nP 用 _\$b1 生成 _\$k0
console.log('\n=== _$nP 函数（_$k0 生成器） ===');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');
const nPIdx = body.indexOf('function _$nP');
console.log('_\$nP @', nPIdx);
if (nPIdx >= 0) {
  console.log(body.substring(nPIdx, nPIdx + 500));
}