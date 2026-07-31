/**
 * decompile_bytecode.js — 反编译 VM bytecode
 * 
 * 读取 vm-bytecode.json 和 dispatcher-map.json
 * 自动匹配 VM（根据 opcode 范围）
 * 逐操作码反编译
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const bcData = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/capture-20080/vm-bytecode.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/keygen/dispatcher-map.json'), 'utf8'));

const bytecode = bcData.bytecode;
console.log('Bytecode:', bytecode.length, 'bytes');
console.log('Max value:', Math.max(...bytecode));
console.log('Min value:', Math.min(...bytecode));

// 找到匹配的 VM
const vms = map.vms;
let bestVM = null;
let bestVMName = null;

for (const [vmName, vm] of Object.entries(vms)) {
  const ops = vm.opcodes;
  const opKeys = Object.keys(ops).map(Number);
  const maxOp = Math.max(...opKeys);
  const minOp = Math.min(...opKeys);
  const bcMax = Math.max(...bytecode);

  if (bcMax <= maxOp) {
    // 检查所有 bytecode 值是否都是有效操作码
    let allValid = true;
    for (const b of bytecode) {
      if (!ops[String(b)]) {
        allValid = false;
        break;
      }
    }
    if (allValid) {
      console.log(`\nMatched VM: ${vmName} (ops ${minOp}..${maxOp}, ${vm.opcodeCount} opcodes)`);
      console.log(`  Role: ${vm.role}`);
      bestVM = ops;
      bestVMName = vmName;
      break;
    }
  }
}

if (!bestVM) {
  console.log('\nNo exact VM match. Trying closest...');
  for (const [vmName, vm] of Object.entries(vms)) {
    const ops = vm.opcodes;
    const opKeys = Object.keys(ops).map(Number);
    const maxOp = Math.max(...opKeys);
    const bcMax = Math.max(...bytecode);
    if (bcMax <= maxOp) {
      let valid = 0;
      for (const b of bytecode) {
        if (ops[String(b)]) valid++;
      }
      console.log(`  ${vmName}: ${valid}/${bytecode.length} valid ops (max=${maxOp})`);
    }
  }
  process.exit(0);
}

// 反编译
console.log('\n=== 反编译 ===');
let pc = 0;
let step = 0;
const maxSteps = 200;

while (pc < bytecode.length && step < maxSteps) {
  const op = bytecode[pc];
  const opData = bestVM[String(op)];

  if (!opData) {
    console.log(`[${pc}] op=${op} — UNKNOWN`);
    pc++;
    step++;
    continue;
  }

  const categories = opData.categories || [];
  const shape = opData.shape || '';
  const handler = opData.handler || '';

  // 检查是否是 return
  const isReturn = categories.includes('return');
  // 检查是否是 jump
  const isJump = categories.includes('jump-rel');

  console.log(`[${pc}] op=${op} ${categories.join(',')} ${shape.substring(0, 60)}`);
  console.log(`       ${handler.substring(0, 100)}`);

  if (isReturn) {
    console.log('       *** RETURN ***');
    break;
  }

  // 计算下一个 pc
  // 如果是 jump，handler 中的 pc+=N 会改变 pc
  // 但我们不知道条件是否满足，所以只跟踪顺序执行
  pc++;

  // 如果是 jump，也显示 jump 后的位置
  if (isJump) {
    // 从 handler 提取 jump offset
    const jumpMatch = handler.match(/\+=\s*(-?\d+)/);
    if (jumpMatch) {
      const offset = parseInt(jumpMatch[1]);
      const jumpPc = pc + offset;
      console.log(`       (if !cond: jump to [${jumpPc}])`);
    }
  }

  step++;
}

if (step >= maxSteps) {
  console.log('\n... (stopped after 200 steps)');
}

console.log('\n=== 统计 ===');
const opCounts = {};
for (const b of bytecode) {
  opCounts[b] = (opCounts[b] || 0) + 1;
}
console.log('Opcode frequency:');
Object.entries(opCounts).sort((a, b) => b[1] - a[1]).forEach(([op, count]) => {
  const opData = bestVM[op];
  const cats = opData ? opData.categories.join(',') : 'UNKNOWN';
  console.log(`  op${op} (${cats}): ${count} times`);
});
