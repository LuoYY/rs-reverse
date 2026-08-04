/**
 * 854_vm_debug_tables.js
 * 调试 vm sandbox 中 _\$oU/_\$a2 的实际值
 * 关键：错误 reading '88' 可能是 _\$oU[88] 或 _\$a2[88]
 */
const fs = require('fs');
const vm = require('vm');

const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
console.log('=== 表键名 ===');
console.log('keys:', Object.keys(tables).map(k => JSON.stringify(k)).join(', '));

// 检查 _\$oU
const oU = tables['_$oU'];
console.log('\n_$oU 类型:', oU ? oU.type : 'undefined');
console.log('_$oU[88]:', oU && oU.val ? oU.val[88] : 'N/A');
console.log('_$oU 前 20:', oU && oU.val ? oU.val.slice(0, 20).join(',') : 'N/A');

// 检查 _\$a2
const a2 = tables['_$a2'];
console.log('\n_$a2 类型:', a2 ? a2.type : 'undefined');

// 检查 _\$mD
const mD = tables['_$mD'];
console.log('\n_$mD 类型:', mD ? mD.type : 'undefined');
console.log('_$mD[88]:', mD && mD.val ? mD.val[88] : 'N/A');

// 检查 _\$k0
const k0 = tables['_$k0'];
console.log('\n_$k0 类型:', k0 ? k0.type : 'undefined');
console.log('_$k0[88]:', k0 && k0.val ? k0.val[88] : 'N/A');

// 检查 opcode 227 错误的具体位置
// 错误 reading '88'，看 _\$oU[88] 或 _\$a2[88]
// 如果 _\$oU 是 undefined，报 reading '88'（_$oU[88]）
// 如果 _\$a2 是 undefined，报 reading '88'（_$a2[_$oU[88]] 中 _$oU[88]='document' 应为 reading 'document'）
// 所以错误是 _\$oU 是 undefined！
console.log('\n=== 结论 ===');
console.log('错误 reading 88 = _\$oU[88] 时 _\$oU 是 undefined');
console.log('需要确认 sandbox._\$oU 已设置');
console.log('检查 851 脚本 sandbox._\$oU = tables["_$oU"].val');
console.log('如果 tables["_$oU"] 是 undefined，报错');