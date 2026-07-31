/**
 * 27_disassemble_206.js
 *
 * 反汇编 send hook 子程序（206 元素字节码）
 * 定位 plain24 构造：prefix / url_crc / const3 / 调用 [165] 的指令序列
 */
const fs = require('fs');
const path = require('path');

const OPCODES = {
  0: { name: 'PROP_OR_ASSIGN', args: 0 }, 1: { name: 'LOAD_THIS', args: 1 }, 2: { name: 'LOAD_CLOSURE', args: 1 },
  3: { name: 'PROP_ADD_ASSIGN', args: 0 }, 4: { name: 'SUB', args: 0 }, 5: { name: 'SET_TARGET_SCOPE', args: 1 },
  6: { name: 'EQ', args: 0 }, 7: { name: 'CALL_METHOD_1', args: 0 }, 8: { name: 'PROP_GET_CACHED', args: 1 },
  9: { name: 'CALL_METHOD_1_VOID', args: 0 }, 10: { name: 'PROP_SET', args: 0 }, 11: { name: 'SET_TARGET_GLOBAL', args: 1 },
  12: { name: 'LT', args: 0 }, 13: { name: 'VM_CALL', args: 4 }, 14: { name: 'SET_TARGET_CONST', args: 1 },
  15: { name: 'CALL_METHOD_2_VOID', args: 0 }, 16: { name: 'EXIT_2', args: 0 }, 17: { name: 'PUSH_CONST_CACHED', args: 1 },
  18: { name: 'STRICT_EQ', args: 0 }, 19: { name: 'CALL_METHOD_0', args: 0 }, 20: { name: 'PUSH_TRUE', args: 0 },
  21: { name: 'SET_TARGET_THIS', args: 1 }, 22: { name: 'PUSH_FALSE', args: 0 }, 23: { name: 'CALL_METHOD_2', args: 0 },
  24: { name: 'LOAD_CLOSURE_2D', args: 2 }, 25: { name: 'CALL_FUNC_N', args: 1 }, 26: { name: 'JMP_IF_FALSE', args: 1 },
  27: { name: 'PROP_GET_DYN', args: 0 }, 28: { name: 'JMP_IF_TRUE', args: 1 }, 29: { name: 'LOAD_SCOPE', args: 1 },
  30: { name: 'JMP_IF_NOT', args: 1 }, 31: { name: 'CALL_METHOD_2_PUSH', args: 0 }, 32: { name: 'LOAD_GLOBAL', args: 1 },
  33: { name: 'PROP_SET_CACHED_JZ', args: 1 }, 34: { name: 'RETURN', args: 0 }, 35: { name: 'PROP_SET_CACHED_FU', args: 1 },
  36: { name: 'PROP_INC', args: 0 }, 37: { name: 'PUSH_CONST_POOL', args: 1 }, 38: { name: 'PUSH_LITERAL', args: 1 },
  39: { name: 'NOT', args: 0 }, 40: { name: 'NEW_OBJ', args: 0 }, 41: { name: 'CALL_METHOD_1_PUSH', args: 0 },
  42: { name: 'CALL_FUNC_1', args: 0 }, 43: { name: 'OP43', args: 0 }, 44: { name: 'OP44', args: 0 },
  45: { name: 'OP45', args: 0 }, 46: { name: 'OP46', args: 0 }, 47: { name: 'OP47', args: 0 },
  48: { name: 'OP48', args: 0 }, 49: { name: 'OP49', args: 0 }, 50: { name: 'OP50', args: 0 },
  51: { name: 'OP51', args: 0 }, 52: { name: 'OP52', args: 0 }, 53: { name: 'OP53', args: 0 },
  54: { name: 'OP54', args: 0 }, 55: { name: 'OP55', args: 0 }, 56: { name: 'OP56', args: 0 },
  57: { name: 'OP57', args: 0 }, 58: { name: 'OP58', args: 0 }, 59: { name: 'OP59', args: 0 },
  60: { name: 'OP60', args: 0 }, 61: { name: 'OP61', args: 0 }, 62: { name: 'OP62', args: 0 },
  63: { name: 'OP63', args: 0 }, 64: { name: 'OP64', args: 0 }, 65: { name: 'OP65', args: 0 },
};

// 从 vmfull hit3 提取字节码
const file = fs.readdirSync(path.join(__dirname, 'captures')).filter(f => f.startsWith('vmfull_hit3_')).sort().pop();
const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'captures', file), 'utf8'));
const f1 = d.frames[1];
let bytecode = null;
for (const [k, v] of Object.entries(f1.vars)) {
  if (v && v.t === 'arr' && v.d.length === 206) bytecode = v.d;
}
if (!bytecode) { console.log('未找到 206 字节码'); process.exit(1); }

console.log('字节码 (' + bytecode.length + ' 元素):');
console.log(bytecode.join(','));
console.log();

// 反汇编
let pc = 0;
const lines = [];
while (pc < bytecode.length) {
  const op = bytecode[pc];
  const info = OPCODES[op];
  const start = pc;
  if (!info) {
    lines.push({ pc: start, text: `  ${String(start).padStart(3)}: ??? op=${op}` });
    pc++;
    continue;
  }
  let operands = [];
  if (info.args > 0) {
    for (let i = 0; i < info.args; i++) operands.push(bytecode[pc + 1 + i]);
    pc += 1 + info.args;
  } else {
    pc++;
  }
  let comment = '';
  if (op === 13) comment = ` // ★VM_CALL sub=${operands[0]} len=${operands[1]} jump=${operands[2]} extra=${operands[3]}`;
  else if (op === 29) comment = ` // scope:${operands[0]}`;
  else if (op === 38) comment = ` // lit:${operands[0]}`;
  else if (op === 34) comment = ' // ★RETURN';
  else if (op === 16) comment = ' // ★EXIT';
  else if (op === 26 || op === 28 || op === 30) comment = ` // → PC ${pc + operands[0]}`;
  else if (op === 1) comment = ` // this[${operands[0]}]`;
  else if (op === 2) comment = ` // closure[${operands[0]}]`;
  else if (op === 21) comment = ` // target=this[${operands[0]}]`;
  else if (op === 32) comment = ` // global[${operands[0]}]`;
  else if (op === 37) comment = ` // constPool[${operands[0]}]`;
  else if (op === 14) comment = ` // target=constPool[${operands[0]}]`;
  else if (op === 5) comment = ` // target=scope[${operands[0]}]`;
  else if (op === 11) comment = ` // target=global`;
  lines.push({ pc: start, text: `  ${String(start).padStart(3)}: ${info.name.padEnd(20)} ${operands.join(',').padEnd(8)}${comment}` });
}

lines.forEach(l => console.log(l.text));
console.log();

// 关键操作分析
console.log('=== 关键操作 ===');
lines.forEach(l => {
  if (l.text.includes('★VM_CALL')) console.log(l.text);
});
console.log();

// 找调用 global[165] 的位置（构造 plain24 后调用 [165]）
console.log('=== 涉及 165 / 构造 24B 的操作 ===');
lines.forEach(l => {
  if (l.text.includes('global[165]') || l.text.includes('lit:165') || l.text.includes('lit:24') || l.text.includes('lit:32')) {
    console.log(l.text);
  }
});
