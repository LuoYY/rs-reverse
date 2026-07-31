/**
 * 12_full_decode.js
 * 
 * 完整操作码表 + 完整反汇编
 * 基于 8852 字符 dispatcher 源码
 */

// 完整操作码表（从 dispatcher 源码逆向）
const OPCODES = {
  0:  { name: 'PROP_OR_ASSIGN',     args: 0, desc: 'obj[prop] |= pop()' },
  1:  { name: 'LOAD_THIS',          args: 1, desc: 'push this[op]' },
  2:  { name: 'LOAD_CLOSURE_VAR',   args: 1, desc: 'push closure_var(op)' },
  3:  { name: 'PROP_ADD_ASSIGN',    args: 0, desc: 'obj[prop] += pop()' },
  4:  { name: 'SUB',                args: 0, desc: 'push a - b' },
  5:  { name: 'SET_TGT_SCOPE',      args: 1, desc: 'target=scope, prop=op' },
  6:  { name: 'EQ',                 args: 0, desc: 'push a == b' },
  7:  { name: 'CALL_1_PUSH',        args: 0, desc: 'push obj[method](arg1)' },
  8:  { name: 'PROP_GET_CACHE_FU',  args: 1, desc: 'push pop()[fu[op]] (cached→71)' },
  9:  { name: 'CALL_1_NP',          args: 0, desc: 'obj[method](arg1) no push' },
  10: { name: 'PROP_SET',           args: 0, desc: 'obj[prop] = pop()' },
  11: { name: 'SET_TGT_GLOBAL',     args: 1, desc: 'target=global, prop=op' },
  12: { name: 'LT',                 args: 0, desc: 'push a < b' },
  13: { name: 'VM_CALL',            args: 4, desc: 'call_sub(start,end,jump,extra)' },
  14: { name: 'SET_TGT_CONST',      args: 1, desc: 'target=const_pool, prop=op' },
  15: { name: 'CALL_2_NP',          args: 0, desc: 'obj[method](a1,a2) no push' },
  16: { name: 'EXIT_2',             args: 0, desc: 'exit(code=2) abort' },
  17: { name: 'PUSH_CONST_CACHE',   args: 1, desc: 'push a6[op] (cached→38)' },
  18: { name: 'STRICT_EQ',          args: 0, desc: 'push a === b' },
  19: { name: 'CALL_0_NP',          args: 0, desc: 'obj[method]() no push' },
  20: { name: 'PUSH_TRUE',          args: 0, desc: 'push true' },
  21: { name: 'SET_TGT_THIS',       args: 1, desc: 'target=this, prop=op' },
  22: { name: 'PUSH_FALSE',         args: 0, desc: 'push false' },
  23: { name: 'CALL_2_NP2',         args: 0, desc: 'obj[method](a1,a2) no push' },
  24: { name: 'LOAD_CLOSURE_2D',    args: 2, desc: 'push closure[op1][op2]' },
  25: { name: 'CALL_FUNC_N',        args: 1, desc: 'push func(pop N args)' },
  26: { name: 'JMP_IF_FALSE',       args: 1, desc: 'if(!pop()) PC+=op' },
  27: { name: 'PROP_GET_DYN',       args: 0, desc: 'push obj[idx]' },
  28: { name: 'JMP_IF_TRUE',        args: 1, desc: 'if(pop()) PC+=op' },
  29: { name: 'LOAD_SCOPE',         args: 1, desc: 'push scope[op]' },
  30: { name: 'JMP_IF_NOT',         args: 1, desc: 'if(!pop()) PC+=op' },
  31: { name: 'CALL_2_PUSH',        args: 0, desc: 'push obj[method](a1,a2)' },
  32: { name: 'LOAD_GLOBAL',        args: 1, desc: 'push global[op]' },
  33: { name: 'PROP_SET_G',         args: 1, desc: 'obj[g[op]] = pop()' },
  34: { name: 'RETURN',             args: 0, desc: 'return pop() (exit=1)' },
  35: { name: 'PROP_SET_FU',        args: 1, desc: 'obj[fu[op]] = pop()' },
  36: { name: 'PROP_INC',           args: 0, desc: 'obj[prop]++' },
  37: { name: 'PUSH_CONST',         args: 1, desc: 'push const[op]' },
  38: { name: 'PUSH_LITERAL',       args: 1, desc: 'push literal(op)' },
  39: { name: 'NOT',                args: 0, desc: 'push !pop()' },
  40: { name: 'NEW_OBJ',            args: 0, desc: 'push {}' },
  41: { name: 'CALL_1_PUSH2',       args: 0, desc: 'push obj[method](arg1)' },
  42: { name: 'CALL_FUNC_1',        args: 0, desc: 'push func(arg1)' },
  43: { name: 'ADD',                args: 0, desc: 'push a + b' },
  44: { name: 'NEQ',                args: 0, desc: 'push a !== b' },
  45: { name: 'TYPEOF',             args: 0, desc: 'push typeof pop()' },
  46: { name: 'SET_TGT_POP_FU',     args: 0, desc: 'target=pop(), prop=fu[next] (cached→85)' },
  47: { name: 'CALL_0_PUSH',        args: 0, desc: 'push obj[method]()' },
  48: { name: 'PUSH_CONST_G',       args: 1, desc: 'push g[op] (cached→38)' },
  49: { name: 'SET_TGT_POP_G',      args: 0, desc: 'target=pop(), prop=g[next] (cached→85)' },
  50: { name: 'SET_TGT_CLOSURE',    args: 2, desc: 'target=closure[op1], prop=op2' },
  51: { name: 'GT',                 args: 0, desc: 'push a > b' },
  52: { name: 'IN',                 args: 0, desc: 'push a in b' },
  53: { name: 'BIT_AND',            args: 0, desc: 'push a & b' },
  54: { name: 'JMP_BACK',           args: 1, desc: 'PC -= op (backward jump)' },
  55: { name: 'NEQ_LOOSE',          args: 0, desc: 'push a != b' },
  56: { name: 'LOAD_ARGS_2D',       args: 2, desc: 'push args[op1][op2]' },
  57: { name: 'CALL_3_NP',          args: 0, desc: 'obj[method](a1,a2,a3) no push' },
  58: { name: 'CALL_2_PUSH2',       args: 0, desc: 'push obj[method](a1,a2)' },
  59: { name: 'JMP_FWD',             args: 1, desc: 'PC += op (forward jump)' },
  60: { name: 'RESOLVE_STACK',      args: 0, desc: 'target=pop(), prop=pop()' },
  61: { name: 'CALL_0_PUSH2',       args: 0, desc: 'push obj[method]()' },
  62: { name: 'NEW_ARRAY',          args: 0, desc: 'push []' },
  63: { name: 'PUSH_PROP',          args: 0, desc: 'obj.push(pop())' },
  64: { name: 'JMP_IF_FALSE2',      args: 1, desc: 'if(!pop()) PC+=op' },
  65: { name: 'CALL_0_NP2',         args: 0, desc: 'obj[method]() no push' },
  66: { name: 'PROP_DEC',           args: 0, desc: '--obj[prop]' },
  67: { name: 'CALL_4_PUSH',        args: 0, desc: 'push obj[method](a1,a2,a3,a4)' },
  68: { name: 'CALL_3_PUSH',        args: 0, desc: 'push obj[method](a1,a2,a3)' },
  69: { name: 'MUL',                args: 0, desc: 'push a * b' },
  70: { name: 'THROW',              args: 0, desc: 'throw pop()' },
  71: { name: 'PROP_GET_STR',       args: 1, desc: 'push pop()[str] (cached op8)' },
  72: { name: 'PROP_DEC_POST',      args: 0, desc: 'obj[prop]--' },
  73: { name: 'PROP_GET_REG',       args: 1, desc: 'result = result[prop]' },
  74: { name: 'PROP_GET_POP',       args: 1, desc: 'result = pop()[prop]' },
  75: { name: 'ADD_STR',            args: 0, desc: 'push a + b (string concat)' },
  76: { name: 'PUSH_OP',            args: 1, desc: 'result = operand' },
  77: { name: 'SHR',                args: 0, desc: 'push a >> b' },
  78: { name: 'CALL_4_PUSH2',       args: 0, desc: 'push obj[method](a1,a2,a3,a4)' },
  79: { name: 'GTE',                args: 0, desc: 'push a >= b' },
  80: { name: 'CALL_3_PUSH2',       args: 0, desc: 'push obj[method](a1,a2,a3)' },
  81: { name: 'DELETE',             args: 0, desc: 'delete obj[prop]' },
  82: { name: 'PROP_INC_PRE',       args: 0, desc: '++obj[prop]' },
  83: { name: 'XOR',                args: 0, desc: 'push a ^ b' },
  84: { name: 'APPLY',              args: 1, desc: 'obj[method].apply(obj, args)' },
  85: { name: 'SET_TGT_POP',        args: 1, desc: 'target=pop(), prop=op' },
  86: { name: 'PROP_SUB_ASSIGN',    args: 0, desc: 'obj[prop] -= pop()' },
  87: { name: 'LTE',                args: 0, desc: 'push a <= b' },
  88: { name: 'PROP_INC_PRE2',      args: 0, desc: '++obj[prop]' },
  89: { name: 'INSTANCEOF',         args: 0, desc: 'push a instanceof b' },
  90: { name: 'FOR_IN',             args: 1, desc: 'for(key in pop()) { sub }' },
  91: { name: 'PUSH_NULL',          args: 0, desc: 'push null' },
  92: { name: 'CALL_5_PUSH',        args: 0, desc: 'push obj[method](a1..a5)' },
  93: { name: 'PROP_SET_PUSH',      args: 0, desc: 'obj[prop]=pop(); push result' },
  94: { name: 'MOD',                args: 0, desc: 'push a % b' },
  95: { name: 'SWITCH',             args: 1, desc: 'switch(pop()) jump table' },
  96: { name: 'PROP_XOR_ASSIGN',    args: 0, desc: 'obj[prop] ^= pop()' },
  97: { name: 'SHL',                args: 0, desc: 'push a << b' },
  98: { name: 'USHR',               args: 0, desc: 'push a >>> b' },
  99: { name: 'PROP_INC_PRE3',      args: 0, desc: '++obj[prop]' },
  100:{ name: 'CALL_3_NP2',         args: 0, desc: 'obj[method](a1,a2,a3) no push' },
  101:{ name: 'PROP_GET_RESULT',    args: 1, desc: 'push result[prop]' },
  102:{ name: 'CALL_4_NP',          args: 0, desc: 'obj[method](a1..a4) no push' },
  103:{ name: 'BIT_NOT',            args: 0, desc: 'push ~pop()' },
  104:{ name: 'CALL_FUNC_N2',       args: 1, desc: 'push func(pop N args)' },
  105:{ name: 'CALL_4_PUSH3',       args: 0, desc: 'push obj[method](a1..a4)' },
  106:{ name: 'SET_TGT_ARGS',       args: 2, desc: 'target=args[op1], prop=op2' },
  107:{ name: 'PROP_GET_CACHE_G',   args: 1, desc: 'push pop()[g[op]] (cached→71)' },
  108:{ name: 'SET_TGT_STACK',      args: 0, desc: 'target=stack, prop=SP' },
  109:{ name: 'DEBUGGER',           args: 0, desc: 'debugger statement' },
  110:{ name: 'BIT_OR',             args: 0, desc: 'push a | b' },
  111:{ name: 'CALL_5_PUSH2',       args: 0, desc: 'push obj[method](a1..a5)' },
  112:{ name: 'PROP_AND_ASSIGN',    args: 0, desc: 'obj[prop] &= pop()' },
  113:{ name: 'DIV',                args: 0, desc: 'push a / b' },
  114:{ name: 'NEG',                args: 0, desc: 'push -pop()' },
};

// _$cR 辅助函数操作码（嵌套在 dispatcher 内部）
const CR_OPCODES = {
  0:  { name: 'CR_SCOPE',    args: 1, desc: 'target=scope, prop=op' },
  1:  { name: 'CR_GLOBAL',   args: 1, desc: 'target=global, prop=op' },
  2:  { name: 'CR_CONST',    args: 1, desc: 'target=const, prop=op' },
  3:  { name: 'CR_THIS',     args: 1, desc: 'target=this, prop=op' },
  46: { name: 'CR_POP_FU',   args: 0, desc: 'target=pop(), prop=fu[next] (→85)' },
  49: { name: 'CR_POP_G',    args: 0, desc: 'target=pop(), prop=g[next] (→85)' },
  50: { name: 'CR_CLOSURE',  args: 2, desc: 'target=closure[op1], prop=op2' },
  60: { name: 'CR_STACK',    args: 0, desc: 'target=pop(), prop=pop()' },
  85: { name: 'CR_POP',      args: 1, desc: 'target=pop(), prop=op' },
  106:{ name: 'CR_ARGS',     args: 2, desc: 'target=args[op1], prop=op2' },
  108:{ name: 'CR_STACK_SP', args: 0, desc: 'target=stack, prop=SP' },
};

// 完整反汇编
const bytecode = [13,11,11,11,3,29,1,71,"callee",7,50,1,25,10,5,2,29,2,28,13,24,2,2,32,65,38,1,27,27,7,50,1,25,42,50,1,26,19,14,113,29,1,38,0,29,0,29,1,38,0,27,41,85,"_$fF",10,60,29,0,71,"_$$W",26,1,16,32,21,32,65,38,5,27,29,0,29,1,58,60,34];

console.log('=== 完整反汇编（77 元素 bytecode）===\n');

let pc = 0;
while (pc < bytecode.length) {
  const op = bytecode[pc];
  const info = OPCODES[op];
  
  if (!info) {
    console.log(`  ${String(pc).padStart(3)}: ??? op=${op}`);
    pc++;
    continue;
  }
  
  let operandStr = '';
  let comment = '';
  const startPc = pc;
  
  if (op === 71 || op === 85) {
    operandStr = ` "${bytecode[pc + 1]}"`;
    pc += 2;
  } else if (info.args > 0) {
    const ops = [];
    for (let i = 0; i < info.args; i++) ops.push(bytecode[pc + 1 + i]);
    operandStr = ` ${ops.join(', ')}`;
    pc += 1 + info.args;
    
    // 特殊注释
    if (op === 13) comment = ` // sub(${ops[0]}..${ops[1]}), jump=${ops[2]}`;
    if (op === 29) {
      const names = {0:'this', 1:'arguments', 2:'scope_obj', 3:'closure'};
      comment = ` // ${names[ops[0]] || 'var_'+ops[0]}`;
    }
    if (op === 50) comment = ` // target=closure[${ops[0]}], prop=${ops[1]}`;
    if (op === 26 || op === 28 || op === 30) comment = ` // → PC ${pc + ops[0]}`;
  } else {
    pc++;
  }
  
  if (op === 34) comment = ' // ★ RETURN';
  if (op === 16) comment = ' // ★ ABORT';
  
  console.log(`  ${String(startPc).padStart(3)}: ${info.name.padEnd(22)}${operandStr}${comment}`);
}

console.log('\n=== 程序语义分析 ===\n');
console.log('send hook VM 程序完整语义：');
console.log('');
console.log('  [初始化]');
console.log('  PC 0:   VM_CALL → 调用子程序（可能是 URL 解析/检查）');
console.log('  PC 5-9: 获取 arguments.callee 并调用方法');
console.log('  PC 10-13: 设置 closure[1][25] 属性');
console.log('');
console.log('  [条件分支]');
console.log('  PC 14-18: 检查 scope[2]，如果为 true 跳到 PC 33');
console.log('  PC 20-30: 否则执行初始化（加载闭包/全局/调用方法）');
console.log('');
console.log('  [核心处理]');
console.log('  PC 33:  CALL_FUNC_1 → ★ 调用函数（可能是 query 加密）');
console.log('  PC 34-37: 调用 closure[1][26]()（可能是状态更新）');
console.log('  PC 38-51: 处理 arguments[0]（XHR body），设置 _$fF 属性');
console.log('');
console.log('  [守卫检查]');
console.log('  PC 55-60: 从栈解析目标，检查 this["_$$W"]');
console.log('  PC 62: 如果 _$$W 为 falsy → EXIT_2（中止）');
console.log('');
console.log('  [Query 生成]');
console.log('  PC 63-69: 加载 global[21] 和 global[65][5]');
console.log('  PC 70-72: 加载 this 和 arguments');
console.log('  PC 74:  ★ CALL_2_PUSH → 调用方法生成 query！');
console.log('  PC 75:  RESOLVE_STACK → 解析结果');
console.log('  PC 76:  RETURN → 返回 query 值');

console.log('\n=== 操作码统计 ===\n');
console.log(`总操作码: ${Object.keys(OPCODES).length} 个 (0-114)`);
console.log(`Bytecode 使用: ${new Set(bytecode.filter(x => typeof x === 'number')).size} 个`);
console.log(`_$cR 辅助操作码: ${Object.keys(CR_OPCODES).length} 个`);
