/**
 * 848_fix_window_global.js
 * 修复 window 全局变量：Node 中 window 是 undefined
 * 需要 var window = globalThis（全局变量声明，非仅 globalThis.window 属性）
 * 关键：IIFE 内 window 引用（_$a2=window）解析到全局变量
 */
const fs = require('fs');

// 读取注入版 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 读取执行器并修改
const run = fs.readFileSync('/tmp/nx_vm_executor_injected.js', 'utf8');

// 在执行器顶层加 window 全局变量声明
// 用 var window = globalThis（在 IIFE eval 前）
const newRun = run.replace(
  'globalThis.window = globalThis;',
  'globalThis.window = globalThis;\nvar window = globalThis;\nvar self = globalThis;\nvar top = globalThis;\nvar parent = globalThis;\nvar frames = globalThis;\nvar document = globalThis.document;\nvar navigator = globalThis.navigator;\nvar location = globalThis.location;\nvar screen = globalThis.screen;\nvar history = globalThis.history;\n'
);

fs.writeFileSync('/tmp/nx_vm_executor_injected.js', newRun);
console.log('已更新执行器（声明 window/self/top/parent/frames/document/navigator/location/screen/history 全局变量）');
console.log('但注意：var 声明在执行器模块作用域，IIFE 的 eval 在 eval 作用域');
console.log('eval 的 IIFE 无法访问模块的 var！');
console.log('需要：eval 前用 globalThis 设置，或用间接 eval');

// 关键问题：eval 的 IIFE 作用域
// 直接 eval({injected}) 在模块作用域执行
// IIFE 内 window 引用解析到模块作用域（var window）
// 但模块的 var window 不可见（IIFE 在 eval 作用域）
// 实际：eval 的 IIFE 顶层 var 提升，IIFE 内 window 引用
// 非严格模式，IIFE 内 window 引用 → 全局（globalThis.window）
// 但 Node 中 globalThis.window 是属性，非全局变量
// 非严格模式 IIFE 内 window 引用 → 全局作用域查找
// 全局作用域 = 模块作用域（Node）？不，是真正全局
// 真正全局 = globalThis
// window 引用 → globalThis.window（属性）
// 我们设了 globalThis.window = globalThis
// 应该有效
// 但测试 typeof window = undefined（Node REPL 中）
// 因为 REPL 中 window 未定义（globalThis.window 设了但未生效？）
// 实际上 globalThis.window = globalThis 后，window 应可引用
// 但 REPL 中 typeof window = undefined
// 说明 globalThis.window 设置没生效？不，REPL 是独立测试
// 执行器里 globalThis.window = globalThis 设置了
// 但 IIFE 内 window 引用（eval 作用域）
// eval 作用域 → 全局（globalThis）
// 应该读 globalThis.window
// 但错误 _\$a2 undefined（不是 window）
// 说明 opcode 204 执行了 _\$a2=window，window 是 undefined
// 即：IIFE 内 window 引用读到 undefined
// 因为 eval 作用域里 window 未定义
// 需要：eval 的 IIFE 内 window 引用到 globalThis.window
// 但 eval 作用域不链接 globalThis 属性？
// 实际上 eval 作用域 = 当前作用域（模块）
// 模块作用域 window 未定义 → undefined
// 解决：在 IIFE 开头注入 var window = globalThis.window
console.log('\n=== 最终方案 ===');
console.log('在 IIFE 注入块加 var window = globalThis.window 等');
console.log('但 window 是只读全局？不，var 可声明');
console.log('关键：IIFE 内 window 引用在 var 声明后覆盖全局');
console.log('注入 var window = globalThis.window; 在 IIFE 开头');
console.log('但 opcode 204 的 _\$a2=window 会读到 var window');