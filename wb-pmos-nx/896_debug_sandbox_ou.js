/**
 * 896_debug_sandbox_ou.js
 * 调试 sandbox 中 _\$oU 是否真的设置
 * 关键：IIFE 注入 var _$oU = globalThis._$oU，但 sandbox._$oU 可能未设置
 */
const fs = require('fs');
const vm = require('vm');

const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));

// 检查 tables 键
console.log('=== tables 键 ===');
console.log('keys:', Object.keys(tables).map(k => JSON.stringify(k)).join(', '));
console.log('含 _$oU:', Object.keys(tables).includes('_$oU'));
console.log('含 $oU:', Object.keys(tables).includes('$oU'));

// 检查 _\$oU 值
const oU = tables['_$oU'];
console.log('\n_$oU 类型:', oU ? oU.type : 'N/A');
console.log('_$oU val:', oU && oU.val ? JSON.stringify(oU.val.slice(0, 5)) : 'N/A');

// 构建 sandbox 并测试
const sandbox = { console };
sandbox._$oU = tables['_$oU'] ? tables['_$oU'].val : null;
vm.createContext(sandbox);

console.log('\n=== sandbox 测试 ===');
vm.runInContext('console.log("sandbox._$oU:", typeof _$oU, _$oU && _$oU[88]); console.log("globalThis._$oU:", typeof globalThis._$oU, globalThis._$oU && globalThis._$oU[88]);', sandbox);

// 测试 IIFE 注入
vm.runInContext('(function(){ var _$oU = globalThis._$oU; console.log("IIFE内 _$oU:", typeof _$oU, _$oU && _$oU[88]); })()', sandbox);