/**
 * 367_dump_loop_branches.js
 * 动态提取 dispatcher #3 的死循环 opcode 分支代码，分析环境依赖
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_patched.js', 'utf8');

// 找 __w3 的 while
const i = code.indexOf('__w3=');
if (i < 0) { console.log('无 w3'); process.exit(1); }
const whileStart = code.lastIndexOf('while(1){', i);
const seg = code.substring(whileStart, whileStart + 30000);

// 动态提取 opcode 变量
const om = seg.match(/window\.__pX3=([_$\w]+);([_$\w]+)=([_$\w]+)\[([_$\w]+)\+\+\];/);
if (!om) { console.log('未提取 opcode 变量'); process.exit(1); }
const OP = om[2];
console.log('opcode 变量:', OP, '指令:', om[3], 'PC:', om[4]);

// 死循环 opcode 序列（跨会话一致）
const loopOps = [383, 69, 141, 105, 356, 398, 122, 406, 318, 285, 401, 274, 135, 225, 0, 205];
for (const op of loopOps) {
  // 搜索 ===op 或 ==op（处理 else 链）
  const pats = ['===' + op, '==' + op];
  let idx = -1, usedPat = '';
  for (const p of pats) { idx = seg.indexOf(p); if (idx >= 0) { usedPat = p; break; } }
  if (idx < 0) { console.log(`\nop${op}: 未找到`); continue; }
  // 提取分支：从 idx 到下一个 }else 或闭括号（最多 200 字符）
  let branch = seg.substring(idx + usedPat.length, idx + usedPat.length + 200);
  const end1 = branch.indexOf('}else');
  const end2 = branch.indexOf('}}');
  let end = end1 >= 0 ? end1 : end2;
  if (end < 0) end = 200;
  console.log(`\nop${op}:`, branch.substring(0, end).replace(/\n/g, ' ').substring(0, 160));
}
