/**
 * 728_A162_decompile_gS.js
 * 反编译内层 VM bytecode（_\$gS）：操作码 + 操作数流
 * 理解 basearr 生成逻辑
 */
const fs = require('fs');

(async () => {
  const table = JSON.parse(fs.readFileSync('wb-pmos-nx/captures/nx_opcode_table.json', 'utf8'));
  const handlers = table.handlers;

  const gS3 = [11,63,1,2,56,14,2,11,63,1,2,56,14,3,37,1,4,7,14,3,49,1,0,41,76,57,33,12,37,1,4,36,3,21,39,56,14,4,36,3,56,63,1,4,36,4,0];
  const gS2 = [49,1,0,63,1,4,86,12,0];

  // 反编译（操作码 = 当前字节；后续字节可能是操作数，取决于操作码）
  // 参考 _\$\$6（内层 VM 操作码解码器）：从 A 系列分析知分层 if 判断
  // 这里用简单解码：opcode = byte, 然后根据 opcode 决定操作数个数
  // 先看操作码对应的 handler 来推断操作数
  function disasm(gs) {
    const lines = [];
    let pc = 0;
    while (pc < gs.length) {
      const op = gs[pc];
      const h = handlers[op];
      // 统计 handler 中 _\$2[_\$3[ ++_\$4] 操作数个数
      let ops = 0;
      if (h) {
        const mm = h.match(/_\$[A-Za-z0-9_$]+\[[^\[\]]*\+\+\s*[A-Za-z0-9_$]*\]/g);
        if (mm) ops = mm.length;
        // 也统计 ++_\$[A-Za-z0-9_$]+（压栈前自增）
        const mm2 = h.match(/\[\s*\+\+\s*_\$[A-Za-z0-9_$]+\]/g);
        if (mm2 && mm2.length > ops) ops = mm2.length;
      }
      const operands = [];
      for (let i = 0; i < ops && pc + 1 + i < gs.length; i++) operands.push(gs[pc + 1 + i]);
      lines.push(`pc=${pc} op=${op} ops=[${operands.join(',')}] handler=${h ? h.substring(0, 100) : 'UNKNOWN'}`);
      pc += 1 + ops;
    }
    return lines;
  }

  console.log('=== program 3 (47B) ===');
  for (const l of disasm(gS3)) console.log(l);
  console.log('\n=== program 2 (9B) ===');
  for (const l of disasm(gS2)) console.log(l);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
