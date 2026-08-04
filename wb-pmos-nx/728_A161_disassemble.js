/**
 * 728_A161_disassemble.js
 * 用操作码表反编译捕获的内层 VM bytecode（_\$gS）
 */
const fs = require('fs');

(async () => {
  const table = JSON.parse(fs.readFileSync('wb-pmos-nx/captures/nx_opcode_table.json', 'utf8'));
  const handlers = table.handlers;

  const prog = JSON.parse(fs.readFileSync('/tmp/nx_browser_programs.json', 'utf8'));
  const plain = prog.plain;
  console.log('明文 basearr len:', plain.length);
  console.log('明文[0-31]:', plain.slice(0, 32).join(','));

  for (const p of prog.programs) {
    console.log(`\n===== ${p.fn} programs: ${(p.hr || []).length} =====`);
    for (let pi = 0; pi < (p.hr || []).length; pi++) {
      const h = p.hr[pi];
      if (!h) continue;
      console.log(`\n--- program ${pi}: iH=${h.iH} fL=${h.fL} gS len=${h.gS ? h.gS.length : '?'} myLen=${h.myLen} jRLen=${h.jRLen} ---`);
      if (!h.gS) continue;
      // 反编译：带操作数（类似 _\$\$6 的分层解码）
      // bytecode 是操作码 + 立即数混合。这里简单打印原始字节
      console.log('gS bytes:', h.gS.join(','));
    }
  }
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
