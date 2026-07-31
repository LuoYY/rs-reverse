/**
 * 42_disassemble_full.js
 *
 * 完整反汇编 206 字节码（send hook 子程序），精确定位 plain24 构造逻辑
 */
const fs = require('fs');
const path = require('path');

// 从 query_enc 获取字节码
const f = fs.readdirSync(path.join(__dirname, 'captures')).filter(x => x.startsWith('query_enc_')).sort().pop();
const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'captures', f), 'utf8'));
const bytecode = d.bytecode;
const plain24 = d.plain24;
console.log('字节码长度:', bytecode.length);
console.log('plain24:', plain24.map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log();

// 操作码语义（从 dispatcher 源码精确提取）
// 格式: opcode: { name, args, desc }
const OP = {
  0: { n: 'PROP_OR_ASSIGN', a: 0, d: 'target[prop] |= pop()' },
  1: { n: 'LOAD_THIS', a: 1, d: 'push this[op]' },
  2: { n: 'LOAD_CLOSURE', a: 1, d: 'push closure[op]' },
  3: { n: 'PROP_ADD_ASSIGN', a: 0, d: 'target[prop] += pop()' },
  4: { n: 'SUB', a: 0, d: 'push a-b' },
  5: { n: 'SET_TARGET_SCOPE', a: 1, d: 'target = scope[op]' },
  6: { n: 'EQ', a: 0, d: 'push a==b' },
  7: { n: 'CALL_METHOD_1', a: 0, d: 'push target[prop](a1)' },
  8: { n: 'PROP_GET_CACHED', a: 1, d: 'push pop()[str(op)]' },
  9: { n: 'CALL_METHOD_1_VOID', a: 0, d: 'target[prop](a1)' },
  10: { n: 'PROP_SET', a: 0, d: 'target[prop] = pop()' },
  11: { n: 'SET_TARGET_GLOBAL', a: 1, d: 'target = global[op]' },
  12: { n: 'LT', a: 0, d: 'push a<b' },
  13: { n: 'VM_CALL', a: 4, d: 'call_sub(op0,op1,op2,op3)' },
  14: { n: 'SET_TARGET_CONST', a: 1, d: 'target = constPool[op]' },
  15: { n: 'CALL_METHOD_2', a: 0, d: 'push target[prop](a1,a2)' },
  16: { n: 'EXIT_2', a: 0, d: 'exit' },
  17: { n: 'PUSH_CONST_CACHED', a: 1, d: 'push cached_const(op)' },
  18: { n: 'STRICT_EQ', a: 0, d: 'push a===b' },
  19: { n: 'CALL_METHOD_0', a: 0, d: 'push target[prop]()' },
  20: { n: 'PUSH_TRUE', a: 0, d: 'push true' },
  21: { n: 'SET_TARGET_THIS', a: 1, d: 'target = this[op]' },
  22: { n: 'PUSH_FALSE', a: 0, d: 'push false' },
  23: { n: 'CALL_METHOD_2_PUSH', a: 0, d: 'obj[method](a1,a2) push?' },
  24: { n: 'LOAD_CLOSURE_2D', a: 2, d: 'push closure[op1][op2]' },
  25: { n: 'CALL_FUNC_N', a: 1, d: 'push func(pop N args)' },
  26: { n: 'JMP_IF_FALSE', a: 1, d: 'if(!pop()) pc+=op' },
  27: { n: 'PROP_GET_DYN', a: 0, d: 'push pop_obj()[pop_idx()]' },
  28: { n: 'JMP_IF_TRUE', a: 1, d: 'if(pop()) pc+=op' },
  29: { n: 'LOAD_SCOPE', a: 1, d: 'push scope[op]' },
  30: { n: 'JMP_IF_NOT', a: 1, d: 'if(!pop()) pc+=op' },
  31: { n: 'CALL_METHOD_2_PUSH', a: 0, d: 'push obj[method](a1,a2)' },
  32: { n: 'LOAD_GLOBAL', a: 1, d: 'push global[op]' },
  33: { n: 'PROP_SET_CACHED_JZ', a: 1, d: 'target[str(op)] = pop()' },
  34: { n: 'RETURN', a: 0, d: 'return pop()' },
  35: { n: 'PROP_SET_CACHED_FU', a: 1, d: 'target[str(op)] = pop()' },
  36: { n: 'PROP_INC', a: 0, d: 'target[prop]++' },
  37: { n: 'PUSH_CONST_POOL', a: 1, d: 'push constPool[op]' },
  38: { n: 'PUSH_LITERAL', a: 1, d: 'push op' },
  39: { n: 'NOT', a: 0, d: 'push !pop()' },
  40: { n: 'NEW_OBJ', a: 0, d: 'push {}' },
  41: { n: 'CALL_METHOD_1_PUSH', a: 0, d: 'push obj[method](a1)' },
  42: { n: 'CALL_FUNC_1', a: 0, d: 'push func(a1)' },
  43: { n: 'CALL_3_ARGS', a: 0, d: 'push target[prop](a1,a2,a3)' },
  57: { n: 'CALL_METHOD_3', a: 0, d: 'push target[prop](a1,a2,a3)' },
  59: { n: 'OP59', a: 0, d: '?' },
  61: { n: 'CALL_METHOD_0_PUSH', a: 0, d: 'push target[prop]()' },
  62: { n: 'NEW_ARR', a: 0, d: 'push []' },
  63: { n: 'ARR_PUSH', a: 0, d: 'arr[次栈顶].push(pop())' },
  65: { n: 'CALL_METHOD_0_VOID', a: 0, d: 'target[prop]()' },
  68: { n: 'CALL_METHOD_3_VOID', a: 0, d: 'target[prop](a1,a2,a3)' },
  75: { n: 'OP75', a: 0, d: '?' },
  78: { n: 'CALL_METHOD_4', a: 0, d: 'push target[prop](a1..a4)' },
  79: { n: 'GE', a: 0, d: 'push a>=b' },
};

// 反汇编
let pc = 0;
const lines = [];
const jumps = {};
while (pc < bytecode.length) {
  const op = bytecode[pc];
  const info = OP[op];
  const start = pc;
  if (!info) {
    lines.push({ pc: start, text: `  ${String(start).padStart(3)}: ?op=${op}` });
    pc++;
    continue;
  }
  let operands = [];
  if (info.a > 0) {
    for (let i = 0; i < info.a; i++) operands.push(bytecode[pc + 1 + i]);
    pc += 1 + info.a;
  } else pc++;
  let comment = '';
  if (op === 26 || op === 28 || op === 30) comment = ` → PC ${pc + operands[0]}`;
  else if (op === 15 || op === 7 || op === 42 || op === 57 || op === 68 || op === 78 || op === 61 || op === 65) comment = ` ★${info.d}`;
  else if (op === 62) comment = ' ★创建数组';
  else if (op === 63) comment = ' ★数组push';
  else if (op === 34) comment = ' ★RETURN';
  lines.push({ pc: start, text: `  ${String(start).padStart(3)}: ${info.n.padEnd(22)} ${operands.join(',').padEnd(5)}${comment}${info.d ? ' [' + info.d + ']' : ''}` });
}

lines.forEach(l => console.log(l.text));
