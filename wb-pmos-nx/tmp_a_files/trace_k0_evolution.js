// 追踪 _$k0 的演化：执行流中所有操作 _$k0 的 opcode
// 结合精确语义，理解 base 如何从 _$k0 生成
const fs = require('fs');
const stream = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_stream_trace.json');
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
const semMap = {};
const re = /_\$pW===(\d+)\)\{([^}]*?)\}/g;
let m;
while ((m = re.exec(c4))) semMap[+m[1]] = m[2].trim();
const tables = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const ou = tables._$oU.val, k0c = tables._$k0.val;
function resolve(code) {
  let c = code.replace(/_$oU\[(\d+)\]/g, (mm, i) => ou[+i] !== undefined ? JSON.stringify(ou[+i]) : mm);
  c = c.replace(/_$k0\[(\d+)\]/g, (mm, i) => k0c[+i] !== undefined ? String(k0c[+i]) : mm);
  return c;
}

// 找所有操作 _$k0 或 _$ez 的执行步骤
console.log('=== 操作 _$k0/_$ez 的执行步骤 ===');
stream.forEach((t, idx) => {
  const raw = semMap[t.op];
  if (!raw) return;
  if (/_\$k0|_\$ez/.test(raw)) {
    const r = resolve(raw).replace(/\s+/g, ' ').trim();
    console.log('#' + idx + ' pc=' + t.pc + ' op=' + t.op + ' → ' + r.slice(0, 120));
  }
});
