/**
 * 852_vm_min_test.js
 * 最小 vm context 测试：确认 window/_$a2/document 在 vm 中的行为
 */
const vm = require('vm');

const sandbox = {
  console,
  document: { cookie: 'doc-ok' },
  window: null,
  _$a2: null,
};
sandbox.window = sandbox;
sandbox._$a2 = sandbox;

vm.createContext(sandbox);

// 测试1：globalThis 与 sandbox 关系
console.log('=== 测试1: globalThis ===');
vm.runInContext('console.log("globalThis === window:", globalThis === window); console.log("window._$a2:", window._$a2 === window); console.log("document:", document.cookie);', sandbox);

// 测试2：IIFE 内 var _$a2 = globalThis
console.log('\n=== 测试2: IIFE 注入 ===');
vm.runInContext('(function(){ var _$a2 = globalThis; console.log("IIFE内 _$a2 === window:", _$a2 === window); console.log("_$a2.document:", _$a2.document.cookie); })()', sandbox);

// 测试3：opcode 204 模拟
console.log('\n=== 测试3: window 全局变量 ===');
vm.runInContext('(function(){ var _$a2 = window; console.log("_$a2 = window → document:", _$a2.document.cookie); })()', sandbox);

// 测试4：vm 中 window 是否全局变量
console.log('\n=== 测试4: window 解析 ===');
vm.runInContext('console.log("typeof window:", typeof window, "window === sandbox:", window === globalThis);', sandbox);