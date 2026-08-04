/**
 * 895_check_oU_shadow.js
 * 检查 _\$oU 是否被 _\$c4 内部的 var 声明遮蔽
 * 关键：IIFE 注入 var _$oU = globalThis._$oU
 * 但 _\$c4 内部可能有 var _$oU（提升，遮蔽）
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 检查 _\$c4 内部是否有 var _$oU
const c4Idx = body.indexOf('function _$c4');
const c4 = body.substring(c4Idx, c4Idx + 300000);
console.log('_$c4 内 var _$oU:', c4.includes('var _$oU'));
console.log('_$c4 内 var _$b1:', c4.includes('var _$b1'));
console.log('_$c4 内 var _$lc:', c4.includes('var _$lc'));
console.log('_$c4 内 var _$mD:', c4.includes('var _$mD'));
console.log('_$c4 内 var _$k0:', c4.includes('var _$k0'));
console.log('_$c4 内 var _$a2:', c4.includes('var _$a2'));

// 检查 IIFE 顶层（非 _\$c4）的 var _$oU
const top = body.substring(0, c4Idx);
console.log('\nIIFE 顶层 var _$oU:', top.includes('var _$oU'));
console.log('IIFE 顶层 var _$b1:', top.includes('var _$b1'));
console.log('IIFE 顶层 var _$lc:', top.includes('var _$lc'));
console.log('IIFE 顶层 var _$mD:', top.includes('var _$mD'));
console.log('IIFE 顶层 var _$k0:', top.includes('var _$k0'));

// 检查 IIFE 顶层所有 var 声明
console.log('\n=== IIFE 顶层 var 声明 ===');
const topVars = top.match(/var\s+_\$\w+/g);
console.log('IIFE 顶层 var:', topVars ? topVars.slice(0, 30).join(', ') : '无');