/**
 * 08_disassemble.js
 * 
 * 反汇编 send hook 的 77 元素 bytecode
 * 基于 dispatcher 源码构建操作码表
 */

const fs = require('fs');
const path = require('path');

// 从捕获文件加载
const captureFile = fs.readdirSync(path.join(__dirname, 'captures')).find(f => f.startsWith('bytecode_'));
if (!captureFile) { console.log('No capture file'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'captures', captureFile), 'utf8'));

const bytecode = data.bytecode.data;
console.log(`Bytecode: ${bytecode.length} elements`);
console.log(`Raw: [${bytecode.map(x => typeof x === 'string' ? `"${x}"` : x).join(',')}]\n`);

// 操作码表（从 dispatcher 源码逆向）
const OPCODES = {
  0:  { name: 'PROP_OR_ASSIGN', args: 0, desc: 'obj[prop] |= pop()' },
  1:  { name: 'LOAD_THIS', args: 1, desc: 'push this[operand]' },
  2:  { name: 'LOAD_CLOSURE', args: 1, desc: 'push closure_var(operand)' },
  3:  { name: 'PROP_ADD_ASSIGN', args: 0, desc: 'obj[prop] += pop()' },
  4:  { name: 'SUB', args: 0, desc: 'push pop() - pop()' },
  5:  { name: 'SET_TARGET_SCOPE', args: 1, desc: 'target = scope' },
  6:  { name: 'EQ', args: 0, desc: 'push pop() == pop()' },
  7:  { name: 'CALL_METHOD_1', args: 0, desc: 'push obj[method](arg1)' },
  8:  { name: 'PROP_GET_CACHED', args: 1, desc: 'push pop()[str_table(operand)]' },
  9:  { name: 'CALL_METHOD_1_VOID', args: 0, desc: 'obj[method](arg1) (no push)' },
  10: { name: 'PROP_SET', args: 0, desc: 'obj[prop] = pop()' },
  11: { name: 'SET_TARGET_GLOBAL', args: 1, desc: 'target = global_obj' },
  12: { name: 'LT', args: 0, desc: 'push pop() < pop()' },
  13: { name: 'VM_CALL', args: 4, desc: 'call_sub(start, end, jump, extra)' },
  14: { name: 'SET_TARGET_CONST', args: 1, desc: 'target = const_pool' },
  15: { name: 'CALL_METHOD_2_VOID', args: 0, desc: 'obj[method](a1, a2) (no push)' },
  16: { name: 'EXIT_2', args: 0, desc: 'exit(code=2) // abort' },
  17: { name: 'PUSH_CONST_CACHED', args: 1, desc: 'push const_cache(operand)' },
  18: { name: 'STRICT_EQ', args: 0, desc: 'push pop() === pop()' },
  19: { name: 'CALL_METHOD_0', args: 0, desc: 'push obj[method]()' },
  20: { name: 'PUSH_TRUE', args: 0, desc: 'push true' },
  21: { name: 'SET_TARGET_THIS', args: 1, desc: 'target = this' },
  22: { name: 'PUSH_FALSE', args: 0, desc: 'push false' },
  23: { name: 'CALL_METHOD_2', args: 0, desc: 'push obj[method](a1, a2)' },
  24: { name: 'LOAD_CLOSURE_2D', args: 2, desc: 'push closure[op1][op2]' },
  25: { name: 'CALL_FUNC_N', args: 1, desc: 'push func(pop N args)' },
  26: { name: 'JMP_IF_FALSE', args: 1, desc: 'if(!pop()) PC += operand' },
  27: { name: 'PROP_GET_DYN', args: 0, desc: 'push pop_obj()[pop_idx()]' },
  28: { name: 'JMP_IF_TRUE', args: 1, desc: 'if(pop()) PC += operand' },
  29: { name: 'LOAD_SCOPE', args: 1, desc: 'push scope[operand]' },
  30: { name: 'JMP_IF_NOT', args: 1, desc: 'if(!pop()) PC += operand' },
  31: { name: 'CALL_METHOD_2_PUSH', args: 0, desc: 'push obj[method](a1, a2)' },
  32: { name: 'LOAD_GLOBAL', args: 1, desc: 'push global[operand]' },
  33: { name: 'PROP_SET_CACHED_JZ', args: 1, desc: 'obj[str_jZ(op)] = pop()' },
  34: { name: 'RETURN', args: 0, desc: 'return pop() (exit code=1)' },
  35: { name: 'PROP_SET_CACHED_FU', args: 1, desc: 'obj[str_fu(op)] = pop()' },
  36: { name: 'PROP_INC', args: 0, desc: 'obj[prop]++' },
  37: { name: 'PUSH_CONST_POOL', args: 1, desc: 'push const_pool[operand]' },
  38: { name: 'PUSH_LITERAL', args: 1, desc: 'push literal(operand)' },
  39: { name: 'NOT', args: 0, desc: 'push !pop()' },
  40: { name: 'NEW_OBJ', args: 0, desc: 'push {}' },
  41: { name: 'CALL_METHOD_1_PUSH', args: 0, desc: 'push obj[method](arg1)' },
  42: { name: 'CALL_FUNC_1', args: 0, desc: 'push func(arg1)' },
  // 43-47: more opcodes (not fully reversed)
  50: { name: 'UNKNOWN_50', args: 0, desc: '(needs analysis)' },
  58: { name: 'UNKNOWN_58', args: 0, desc: '(needs analysis)' },
  60: { name: 'UNKNOWN_60', args: 0, desc: '(needs analysis)' },
  65: { name: 'UNKNOWN_65', args: 0, desc: '(needs analysis)' },
  71: { name: 'PROP_GET_STR', args: 1, desc: 'push pop()[string_operand] (cached op8)' },
  85: { name: 'PROP_SET_STR', args: 1, desc: 'obj[string_operand] = pop() (cached op35)' },
  113: { name: 'UNKNOWN_113', args: 0, desc: '(needs analysis)' },
};

// 反汇编
console.log('=== 反汇编 ===\n');
let pc = 0;
let indent = 0;
const lines = [];

while (pc < bytecode.length) {
  const op = bytecode[pc];
  const info = OPCODES[op];
  
  if (!info) {
    lines.push({ pc, text: `  ${String(pc).padStart(3)}: ??? op=${op}` });
    pc++;
    continue;
  }
  
  let operands = [];
  let operandStr = '';
  
  // 特殊处理缓存操作码（71, 85 等带字符串操作数）
  if (op === 71 || op === 85) {
    const strOp = bytecode[pc + 1];
    operandStr = ` "${strOp}"`;
    pc += 2;
  } else if (info.args > 0) {
    for (let i = 0; i < info.args; i++) {
      operands.push(bytecode[pc + 1 + i]);
    }
    operandStr = ` ${operands.join(', ')}`;
    pc += 1 + info.args;
  } else {
    pc++;
  }
  
  // 特殊注释
  let comment = '';
  if (op === 13) {
    comment = ` // sub(${operands[0]}..${operands[1]}), jump=${operands[2]}, extra=${operands[3]}`;
  } else if (op === 29) {
    const scopeNames = { 0: 'this', 1: 'arguments', 2: 'scope_obj', 3: 'closure' };
    comment = ` // ${scopeNames[operands[0]] || 'var_' + operands[0]}`;
  } else if (op === 38) {
    comment = ` // literal: ${operands[0]}`;
  } else if (op === 34) {
    comment = ' // ★ RETURN';
  } else if (op === 16) {
    comment = ' // ★ EXIT(abort)';
  } else if (op === 26 || op === 28 || op === 30) {
    const target = pc + operands[0];
    comment = ` // → PC ${target}`;
  }
  
  lines.push({
    pc: pc - 1 - (info.args || 0) - (op === 71 || op === 85 ? 1 : 0),
    text: `  ${String(pc - 1 - (info.args || 0) - (op === 71 || op === 85 ? 1 : 0)).padStart(3)}: ${info.name.padEnd(22)}${operandStr}${comment}`
  });
}

lines.forEach(l => console.log(l.text));

// 控制流分析
console.log('\n=== 控制流分析 ===\n');

// 找所有跳转目标
const jumpTargets = new Set();
pc = 0;
while (pc < bytecode.length) {
  const op = bytecode[pc];
  const info = OPCODES[op];
  if (!info) { pc++; continue; }
  
  if (op === 26 || op === 28 || op === 30) {
    const offset = bytecode[pc + 1];
    jumpTargets.add(pc + 2 + offset);
    pc += 2;
  } else if (op === 13) {
    // VM_CALL: 跳转到 PC + 5 + jump_offset
    const jumpOff = bytecode[pc + 3];
    jumpTargets.add(pc + 5 + jumpOff);
    pc += 5;
  } else if (op === 71 || op === 85) {
    pc += 2;
  } else {
    pc += 1 + (info.args || 0);
  }
}

console.log('跳转目标:', [...jumpTargets].sort((a,b) => a-b).join(', '));

// 分析程序结构
console.log('\n=== 程序结构推测 ===\n');
console.log('send hook VM 程序（77 字节）：');
console.log('  PC 0-4:   VM_CALL → 调用子程序（可能是检查/初始化）');
console.log('  PC 5-9:   加载 arguments.callee（获取自身引用）');
console.log('  PC 10-15: 条件检查 + 方法调用');
console.log('  PC 16-18: 加载作用域变量');
console.log('  PC 19-29: 条件跳转 + 属性访问');
console.log('  PC 30-41: 方法调用 + 条件跳转');
console.log('  PC 42-50: 常量加载 + 属性操作');
console.log('  PC 51-60: 字符串属性操作（cached）');
console.log('  PC 61-76: 最终操作 + RETURN');

// 分析 query 差分
console.log('\n=== Query 差分分析 ===\n');
const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';

function string2numarr(str) {
  const keys = basestr.split('');
  const lookup = {};
  keys.forEach((ch, idx) => { lookup[ch] = idx; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = lookup[str[i]], c1 = lookup[str[i+1]], c2 = lookup[str[i+2]], c3 = lookup[str[i+3]];
    if (c0 !== undefined && c1 !== undefined) ans.push((c0 << 2) | (c1 >> 4));
    if (c1 !== undefined && c2 !== undefined) ans.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c2 !== undefined && c3 !== undefined) ans.push(((c2 & 3) << 6) | c3);
  }
  return ans;
}

function crc32(arr) {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  let v = -1;
  for (let i = 0; i < arr.length; i++) v = (v >>> 8) ^ t[(v ^ arr[i]) & 255];
  return (v ^ -1) >>> 0;
}

if (data.queries && data.queries.length > 0) {
  const decoded = data.queries.map((q, i) => {
    const bytes = string2numarr(q.query.substring(1));
    return { idx: i, method: q.method, bytes };
  });
  
  // CRC32 验证
  let allCrcOk = true;
  for (const d of decoded) {
    if (d.bytes.length !== 88) { allCrcOk = false; continue; }
    const stored = ((d.bytes[0]<<24)|(d.bytes[1]<<16)|(d.bytes[2]<<8)|d.bytes[3]) >>> 0;
    const computed = crc32(d.bytes.slice(4));
    if (stored !== computed) allCrcOk = false;
  }
  console.log(`CRC32 验证: ${decoded.length}/${decoded.length} ${allCrcOk ? '✅ 全部通过' : '❌ 有失败'}`);
  
  // 差分
  if (decoded[0]?.bytes.length === 88) {
    const ref = decoded[0].bytes;
    const fixed = new Array(88).fill(true);
    for (const d of decoded) {
      for (let i = 0; i < 88; i++) {
        if (d.bytes[i] !== ref[i]) fixed[i] = false;
      }
    }
    
    const fixedRanges = [];
    let start = -1;
    for (let i = 0; i < 88; i++) {
      if (fixed[i] && start === -1) start = i;
      if ((!fixed[i] || i === 87) && start !== -1) {
        fixedRanges.push([start, fixed[i] ? i : i - 1]);
        start = -1;
      }
    }
    console.log(`固定段: ${fixedRanges.map(r => `[${r[0]}..${r[1]}](${r[1]-r[0]+1}B)`).join(', ')}`);
    console.log(`变化段: bytes[0..3](CRC32/nonce) + bytes[56..87](request_data)`);
    
    // 输出 session_data hex
    console.log(`\nsession_data (48B, 同会话固定):`);
    console.log(`  ${ref.slice(7, 55).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    // 输出前 2 个 request_data
    for (let i = 0; i < Math.min(3, decoded.length); i++) {
      console.log(`request_data[${i}] (${decoded[i].method}):`);
      console.log(`  ${decoded[i].bytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }
  }
}

console.log('\n=== 完成 ===');
