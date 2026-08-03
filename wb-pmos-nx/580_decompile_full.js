/**
 * 580_decompile_full.js
 * 用 nx 操作码语义表完整反编译 nx bytecode
 * 依据 nx dispatcher（_$$Y）的精确语义 + 操作数消费规则
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const bc = JSON.parse(fs.readFileSync('/tmp/nx_bytecode.json', 'utf8'));
const nxTable = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/nx_opcode_table.json'))).handlers;

// 操作数消费：根据 dispatcher 语义
// 读 _$_2[++_$hy]（操作数）的 opcode
const consumesOperand = new Set();
// op3: _$h0=_$_2[++_$hy] → 消费 1
// op14: _$h0=_$_2[++_$hy] → 1
// op16: _$_2[++_$hy] 两次？_$h0=_$_2[++_$hy] 一次
// op18: _$iL[_$_2[++_$hy]] → 1
// op20: _$lP=_$_2[++_$hy] → 1
// op28: _$nU[_$_2[++_$hy]] → 1
// op32: _$h0=_$_2[++_$hy] → 1
// op33: _$lP=_$_2[++_$hy] → 1
// op34: _$nU[_$_2[++_$hy]] → 1
// op36: _$lQ[_$_2[++_$hy]] → 1
// op37: _$fe[_$ar][_$_2[++_$hy]] → 2（_$ar + op）
// op41: _$a9[_$_2[++_$hy]] → 1
// op49: _$kc[_$ar][_$_2[++_$hy]] → 2
// op57: _$_w[_$gk++]=_$_2[++_$hy] → 1
// op58: 多个操作数（子 VM 调用）
// op60: _$o_[_$_2[++_$hy]] → 1
// op61: _$pa(_$aB._$ii[_$o9],_$cx) → 1
// op62/63: _$ar=_$_2[++_$hy],_$o9=_$_2[++_$hy] → 2

function operandCount(handler) {
  const h = handler || '';
  // 统计 _$_2[ ++_$hy] 出现次数（每个消费 1 操作数）
  const m = h.match(/_\$2\[\s*\+\+_\$hy\]/g) || [];
  let count = m.length;
  // 有些 opcode 还有 _$_2[_$hy]= 重写
  const m2 = h.match(/_\$2\[_\$hy\]=/g) || [];
  count += m2.length * 0; // 重写不算消费
  return count;
}

// 完整语义描述
const desc = {
  0: 'RETURN stack top', 1: 'CALL2 (2 args)', 2: 'CALL1 METHOD', 3: 'SET GLOBAL idx', 4: 'RETURN void',
  5: 'CALL1 GLOBAL', 6: 'LT', 7: 'COND<=4', 8: 'in', 9: '!==', 10: '+', 11: 'COND<=8',
  12: 'GET OBJ[PROP]', 13: 'CALL2 METHOD', 14: 'SET GLOBAL2 idx', 15: 'COND<=3', 16: 'PUSH KEYS pool',
  17: 'CALL0 METHOD', 18: 'PUSH CONST POOL idx', 19: 'COND<=16', 20: 'JMP BACK', 21: 'CALL2 METHOD2',
  22: '==', 23: 'COND<=20', 24: '-', 25: 'PUSH null', 26: 'CALL0', 27: 'COND<=24', 28: 'SET VAR from pool',
  29: '!=', 30: '===', 31: 'COND<=28', 32: 'JMP IF TRUE', 33: 'JMP', 34: 'GET PROP via pool', 35: 'COND<=32',
  36: 'PUSH GLOBAL pool', 37: 'PUSH 2D pool', 38: 'JMP IF FALSE', 39: 'COND<=36', 40: 'PUSH {}', 41: 'PUSH CONST2',
  42: '!', 43: 'COND<=40', 44: 'PUSH false', 45: 'CALL2', 46: 'SET GLOBAL3 idx', 47: 'COND<=44',
  48: 'CALL3', 49: 'PUSH 2D2', 50: 'SET PROP via pool', 51: 'COND<=48', 52: 'PUSH []', 53: 'JMP IF FALSE2',
  54: 'CALL NEW', 55: 'COND<=52', 56: 'TYPEOF', 57: 'PUSH IMMEDIATE', 58: 'CALL SUB VM', 59: 'CALL1 METHOD2',
  60: 'PUSH ARG pool', 61: 'CALL SPECIAL', 62: 'SET GLOBALV idx', 63: 'PUSH PROP pool2',
};

let pc = 0;
const out = [];
while (pc < bc.length) {
  const op = bc[pc];
  const handler = nxTable[op];
  if (handler !== undefined) {
    const n = operandCount(handler);
    const d = desc[op] || ('OP' + op);
    out.push(`[${pc}] op${op} ${d}  ${n > 0 ? '(消耗' + n + '操作数)' : ''}`);
    pc++;
    // 消费操作数
    for (let i = 0; i < n; i++) {
      if (pc < bc.length) { out.push(`      operand: ${bc[pc]}`); pc++; }
    }
  } else {
    out.push(`[${pc}] DATA ${op}`);
    pc++;
  }
}

// 输出（前 120 行）
console.log('=== nx bytecode 反编译 (len=' + bc.length + ') ===');
console.log(out.slice(0, 130).join('\n'));
fs.writeFileSync('/tmp/nx_decompiled.txt', out.join('\n'));
