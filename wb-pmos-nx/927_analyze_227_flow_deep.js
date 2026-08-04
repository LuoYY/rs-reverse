/**
 * 927_analyze_227_flow_deep.js
 * 深入分析 opcode 227 的执行路径
 * 关键：aebi[0] 中 227 @84，204 @30（204 先执行）
 * 但 opcode 226 @497（在 227 后）
 * 所以 227 执行时只经过 204（_$a2=window），未经过 226
 * 227 读 _\$a2[_$oU[88]] → _\$a2=window（204 已执行）
 * _\$oU[88] = "document"（_$oU 表）
 * _\$a2["document"] = sandbox.document（存在）
 * 但错误 _\$oU undefined
 * 说明 _\$oU 在 227 时是 undefined
 * 但 _\$oU 无赋值（204 前 0 次）
 * 且 IIFE 顶层注入 var _$oU = globalThis._\$oU
 * 应该 = sandbox._\$oU（196 表）
 * 但错误 undefined
 * 唯一可能：IIFE 顶层注入没生效（var 提升问题）
 * 或：sandbox._\$oU 是 undefined（tables196 解析失败）
 * 检查 922 的 sandbox._\$oU
 * sandbox._\$oU = tables196._\$oU
 * tables196 = JSON.parse(fs.readFileSync('/tmp/nx_tables_196_merged.json'))
 * 如果 tables196._\$oU 存在 → sandbox._\$oU = 196 数组
 * 应该生效
 * 但错误 undefined
 * 检查：IIFE 顶层注入 var _$oU 在 IIFE 参数后
 * 但 IIFE 是 (function(_$$5,_$lP){var ...})
 * 注入的 var 在 { 后
 * 但 IIFE 可能被压缩（开头有 var _$la=0）
 * 注入位置在 { 后（第一个 {）
 * 检查注入是否正确
 */
const fs = require('fs');

// 检查 922 生成的 body_full
const body = fs.readFileSync('/tmp/nx_vm_body_full.js', 'utf8');
console.log('=== body_full 开头 ===');
console.log(body.substring(0, 200));
console.log();

// 检查注入的 var _$oU
const vIdx = body.indexOf('var _$oU');
console.log('var _$oU @', vIdx);
console.log('上下文:', body.substring(vIdx - 20, vIdx + 40));

// 检查注入是否在 IIFE 内
console.log('注入在 IIFE 内:', vIdx < 300);

// 检查 sandbox._\$oU 值
const tables196 = JSON.parse(fs.readFileSync('/tmp/nx_tables_196_merged.json', 'utf8'));
console.log('\ntables196._\$oU:', tables196._$oU ? 'array len=' + tables196._$oU.length : 'undefined');
console.log('tables196._\$oU[88]:', tables196._$oU ? tables196._$oU[88] : 'N/A');