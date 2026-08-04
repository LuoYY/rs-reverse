/**
 * 840_debug_global.js
 * 调试：检查 eval 前后 globalThis._$a2 和 IIFE 内 _$a2 的实际值
 */
const fs = require('fs');

// 读取注入版 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 简化的环境设置（只测 _$a2）
globalThis._$a2 = globalThis;
globalThis.window = globalThis;
globalThis.document = { cookie: '' };
globalThis._$mD = [null, null, null];
globalThis._$k0 = [];
globalThis._$oU = [];
globalThis.$_ts = {};

console.log('=== eval 前全局 _$a2 ===');
console.log('typeof globalThis._$a2:', typeof globalThis._$a2);
console.log('globalThis._$a2 === globalThis:', globalThis._$a2 === globalThis);

// 用间接 eval（全局作用域）
const indirectEval = (0, eval);
console.log('\n=== 间接 eval 测试 ===');
try {
  indirectEval('console.log("间接eval内 _$a2:", typeof _$a2, _$a2 === globalThis)');
} catch (e) {
  console.log('间接eval错误:', e.message);
}

// 直接 eval（当前作用域）
console.log('\n=== 直接 eval 测试 ===');
try {
  eval('console.log("直接eval内 _$a2:", typeof _$a2, _$a2 === globalThis)');
} catch (e) {
  console.log('直接eval错误:', e.message);
}

// 测试 IIFE 注入
console.log('\n=== IIFE 注入测试（前 300 字符） ===');
console.log(body.substring(0, 300));

// 模拟 IIFE 执行（只执行到注入的 var 行）
console.log('\n=== 模拟 IIFE 顶层 var 执行 ===');
try {
  // 用 Function 构造器（全局作用域）
  const fn = new Function('_$$5', '_$lP', 'var _$a2 = globalThis._$a2; console.log("IIFE内 _$a2:", typeof _$a2, _$a2 === globalThis); return _$a2;');
  const r = fn.call(globalThis, null, null);
  console.log('IIFE 返回 _$a2:', typeof r, r === globalThis);
} catch (e) {
  console.log('Function 构造错误:', e.message);
}