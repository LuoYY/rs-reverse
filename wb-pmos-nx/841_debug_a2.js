/**
 * 841_debug_a2.js
 * 调试 _\$a2 在 eval 时的真实值
 * 关键：确认 globalThis._\$a2 设置 + IIFE 内 _\$a2 读取
 */
const fs = require('fs');

// 读取注入版 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 最小环境设置
globalThis._$a2 = globalThis;
globalThis.window = globalThis;
globalThis.document = { cookie: '', createElement: () => ({}) };
globalThis.$_ts = {};
globalThis._$mD = [];
globalThis._$k0 = [];

console.log('=== 1. eval 前 globalThis._$a2 ===');
console.log('typeof:', typeof globalThis._$a2, '=== globalThis:', globalThis._$a2 === globalThis);

// 模拟执行器：间接 eval 执行注入版 IIFE 的前 500 字符（只测 var 注入）
console.log('\n=== 2. 测试 IIFE 注入的 var _$a2 ===');
const testIIFE = body.substring(0, 500);
// 找到 IIFE 的完整闭合（前 500 字符可能不闭合，用 Function 构造）
// 用 Function 构造（全局作用域）
try {
  const fn = new Function('_$$5', '_$lP', testIIFE + '\nreturn _$a2;');
  const r = fn.call(globalThis, null, null);
  console.log('IIFE 内 _$a2 typeof:', typeof r, '=== globalThis:', r === globalThis);
} catch (e) {
  console.log('Function 构造错误:', e.message.substring(0, 100));
}

// 测试：直接 eval 完整注入版（捕获错误详情）
console.log('\n=== 3. 完整 IIFE eval 测试（只执行前 1000 字符） ===');
const testSlice = body.substring(0, 1000);
// 找第一个闭合的 IIFE（如果有）
try {
  const fn2 = new Function('_$$5', '_$lP', testSlice + '\nreturn typeof _$a2;');
  const r2 = fn2.call(globalThis, null, null);
  console.log('IIFE 前 1000 字符后 _$a2 typeof:', r2);
} catch (e) {
  console.log('错误:', e.message.substring(0, 100));
}

// 关键：检查 _\$c4 函数内是否有 var _$a2（遮蔽闭包）
console.log('\n=== 4. _$c4 内 var _$a2 检查 ===');
const c4Idx = body.indexOf('function _$c4');
if (c4Idx >= 0) {
  // 提取 _$c4 函数体前 2000 字符
  const c4Head = body.substring(c4Idx, c4Idx + 2000);
  const hasVarA2 = c4Head.includes('var _$a2');
  console.log('_$c4 内 var _$a2:', hasVarA2);
  // 找 _$c4 的完整 var 声明
  const vars = c4Head.match(/var\s+_\$\w+/g);
  console.log('_$c4 的 var 声明:', vars ? vars.slice(0, 10).join(', ') : '无');
}

// 关键：检查 opcode 227 所在函数
console.log('\n=== 5. opcode 227 所在函数 ===');
const errPos = 255668; // 注入后偏移
// 找该位置所在函数
const fnStart = body.lastIndexOf('function', errPos);
const fnNameMatch = body.substring(fnStart, fnStart + 60).match(/function (_\$\w+)/);
console.log('opcode 227 所在函数:', fnNameMatch ? fnNameMatch[1] : '?', '@', fnStart);
// 检查该函数是否有 var _$a2
const fnBody = body.substring(fnStart, fnStart + 100000);
console.log('该函数 var _$a2:', fnBody.includes('var _$a2'));