/**
 * 563_decompile_bc.js
 * 反编译 nx bytecode（/tmp/nx_bytecode.json）→ 伪代码
 * 操作码语义：优先用 xb opcode_semantics_v3.json（同一瑞数版本），否则 nx_opcode_table.json
 * 目标：理解 basearr 绑定字节 [26-29]+[84-87] 生成逻辑
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const bc = JSON.parse(fs.readFileSync('/tmp/nx_bytecode.json', 'utf8'));
console.log('bytecode len:', bc.length);

// 操作码表选择：xb 表（语义已知）+ nx 表（变量名 nx 版）
let xbSem = {};
try { xbSem = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-dsv4flash/opcode_semantics_v3.json'))); } catch (e) {}
let nxSem = {};
try { nxSem = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/nx_opcode_table.json'))).handlers; } catch (e) {}
console.log('xb 操作码:', Object.keys(xbSem).length, '个, nx 操作码:', Object.keys(nxSem).length, '个');

// xb 语义的简洁分类（人工整理的，用于可读反编译）
const xbOpSem = {
  0: 'ASSIGN_OP|=', 1: 'PUSH_CONST', 2: 'GET_GLOBAL_FN', 3: 'COND<=0', 4: 'SUB', 5: 'SET_GLOBAL', 6: 'EQ',
  7: 'COND<=4', 8: 'GET_OBJ_PROP', 9: 'CALL_UNARY', 10: 'SET_OBJ_PROP', 11: 'COND<=8', 12: 'LT', 13: 'CALL_SUB_VM',
  14: 'SET_GLOBAL2', 15: 'COND<=3', 16: 'RETURN', 17: 'PUSH_CONST_POOL', 18: 'STRICT_EQ', 19: 'COND<=16', 20: 'PUSH_TRUE',
  21: 'SET_GLOBAL3', 22: 'PUSH_FALSE', 23: 'COND<=20', 24: 'GET_2D', 25: 'CALL_APPLY', 26: 'JUMP_IF_FALSE', 27: 'COND<=24',
  28: 'JUMP_IF_TRUE', 29: 'PUSH_GLOBAL', 30: 'JUMP_IF_FALSE2', 31: 'COND<=19', 32: 'PUSH_DEF', 33: 'SET_PROP', 34: 'RETURN_VAL',
  35: 'COND<=32', 36: 'POST_INC', 37: 'PUSH_GLOBAL2', 38: 'PUSH_LITERAL', 39: 'COND<=36', 40: 'PUSH_OBJ', 41: 'CALL_UNARY_M',
  42: 'CALL_METHOD', 43: 'COND<=40', 44: 'NE', 45: 'TYPEOF', 46: 'SET_VAR', 47: 'COND<=35', 48: 'PUSH_PROP_POOL',
  49: 'RETURN_2', 50: 'GET_VAR_PROP', 51: 'COND<=48', 52: 'SUB_ASSIGN', 53: 'CALL_2', 54: 'CALL_1', 55: 'COND<=52',
  56: 'ASSIGN', 57: 'PUSH_BC', 58: 'CALL_VM', 59: 'CALL_1M', 60: 'PUSH_ARG', 61: 'CALL_SPECIAL', 62: 'SET_GLOBAL_VAR',
};

// 操作码边界：<=N? 语义中 op 值对应实际分支。xb 表 opcode 值就是 bytecode 值（同版本）
// 反编译：逐字节扫描，op 值在操作码表内则显示语义，否则视为数据
let pc = 0;
const lines = [];
while (pc < bc.length) {
  const op = bc[pc];
  const sem = xbOpSem[op] || ('op' + op);
  const isOp = !!xbOpSem[op];
  if (isOp) {
    lines.push(`[${pc}] op${op} ${sem}`);
    pc++;
    // 部分操作码消费操作数（PUSH_LITERAL/PUSH_BC/PUSH_CONST_POOL 等）
    if ([1, 17, 24, 29, 32, 36, 37, 38, 46, 48, 56, 57, 60, 62].includes(op)) {
      if (pc < bc.length) { lines.push(`      └─ data: ${bc[pc]}`); pc++; }
    }
  } else {
    // 数据字节
    lines.push(`      DATA ${op}`);
    pc++;
  }
}
console.log('\n=== 反编译 ===');
console.log(lines.join('\n'));
