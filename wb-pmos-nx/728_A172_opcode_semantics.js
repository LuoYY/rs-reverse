/**
 * 728_A172_opcode_semantics.js
 * 分析关键操作码语义（从 handlers 源码），理解内层 VM 数据流
 * 为模拟执行做准备
 */
const fs = require('fs');

(async () => {
  const table = JSON.parse(fs.readFileSync('wb-pmos-nx/captures/nx_opcode_table.json', 'utf8'));
  const handlers = table.handlers;

  // 打印 program3 用到的操作码 handlers
  const used = [11, 63, 1, 56, 14, 37, 49, 76, 57, 3, 39, 36, 0];
  console.log('=== program3 用到的操作码 ===');
  for (const op of used) {
    console.log(`op${op}: ${String(handlers[op]).substring(0, 180)}`);
  }

  // 关键操作码的完整语义
  console.log('\n=== 关键操作码完整 ===');
  for (const op of [0, 1, 2, 3, 5, 14, 36, 37, 49, 56, 57, 63]) {
    console.log(`\nop${op}: ${handlers[op]}`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
