/**
 * 578_decompile_208.js
 * 反编译 nx 208 元素 bytecode（主 VM 完整版）
 * 用 xb opcode_semantics_v3.json（同瑞数版本，语义一致）
 * 输出完整伪代码流
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const bc = JSON.parse(fs.readFileSync('/tmp/nx_bytecode.json', 'utf8'));
const xbSem = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-dsv4flash/opcode_semantics_v3.json')));

console.log('bytecode len:', bc.length);

// 简化语义映射（人工整理 xb 表）
const sem = {
  0: 'X|=V', 1: 'PUSH const', 2: 'GET global_fn', 3: 'COND', 4: 'SUB', 5: 'SET global', 6: 'EQ',
  7: 'COND', 8: 'OBJ[prop]', 9: 'CALL1', 10: 'OBJ[prop]=V', 11: 'COND', 12: 'LT', 13: 'CALL_subVM',
  14: 'SET glob2', 15: 'COND', 16: 'RETURN', 17: 'PUSH pool', 18: '===', 19: 'COND', 20: 'PUSH true',
  21: 'SET glob3', 22: 'PUSH false', 23: 'COND', 24: 'GET 2D', 25: 'CALL apply', 26: 'IF_FALSE jmp', 27: 'COND',
  28: 'IF_TRUE jmp', 29: 'PUSH global', 30: 'IF_FALSE2', 31: 'COND', 32: 'PUSH def', 33: 'SET prop', 34: 'RETURN val',
  35: 'COND', 36: 'POST_INC', 37: 'PUSH glob2', 38: 'PUSH lit', 39: 'COND', 40: 'PUSH {}', 41: 'CALL1M',
  42: 'CALL method', 43: 'COND', 44: '!==', 45: 'TYPEOF', 46: 'SET var', 47: 'COND', 48: 'PUSH pool',
  49: 'RETURN', 50: 'GET prop', 51: 'COND', 52: '-=', 53: 'CALL2', 54: 'CALL1', 55: 'COND', 56: '=',
  57: 'PUSH bc', 58: 'CALL vm', 59: 'CALL1M2', 60: 'PUSH arg', 61: 'CALL spec', 62: 'SET globv',
};

// 操作码范围（xb 表 0-113，nx 到 116）
// 反编译：op 在表内=操作码，否则=数据
let pc = 0;
const out = [];
while (pc < bc.length) {
  const op = bc[pc];
  if (sem[op] !== undefined) {
    out.push(`[${pc}] OP${op} ${sem[op]}`);
    pc++;
  } else {
    out.push(`[${pc}] DATA ${op}`);
    pc++;
  }
}

// 分组显示（每 20 行）
for (let i = 0; i < out.length; i += 20) {
  console.log(out.slice(i, i + 20).join('\n'));
  console.log('---');
}
