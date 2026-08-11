// 反编译实际执行代码：执行流(2220 opcode) → 语义树翻译 → 真实 JS 动作序列
// 替换 _$oU[i]（字符串池）和 _$k0[i]（常量池）为真实值
const fs = require('fs');
const sem = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_op_semantics_full.json');
const stream = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_stream_trace.json');
const tables = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');

// 字符串池 _$oU
const ou = tables._$oU.val;
// 常量池 _$k0
const k0 = tables._$k0 ? tables._$k0.val : null;

// 替换函数：把语义代码中的 _$oU[N] 替换为真实字符串
function resolve(code) {
  let c = code;
  // 替换 _$oU[N]
  c = c.replace(/_$oU\[(\d+)\]/g, (m, i) => {
    const v = ou[+i];
    return v === undefined ? m : JSON.stringify(v);
  });
  // 替换 _$k0[N]（如果大数组则保留引用）
  if (k0) {
    c = c.replace(/_$k0\[(\d+)\]/g, (m, i) => {
      const v = k0[+i];
      return v === undefined ? m : String(v);
    });
  }
  return c;
}

// 翻译执行流
const lines = [];
stream.forEach((t, idx) => {
  const raw = sem[t.op];
  if (!raw) return;
  const resolved = resolve(raw);
  // 只保留有实际动作的（跳过纯分派器）
  const isDispatcher = /if\(_\$pW<52\)/.test(resolved);
  const action = resolved.replace(/\s+/g, ' ').trim();
  lines.push({ idx, pc: t.pc, op: t.op, action, isDispatcher });
});

// 统计
const actions = lines.filter(l => !l.isDispatcher);
const dispatchers = lines.filter(l => l.isDispatcher);
console.log('总执行步数:', lines.length, '实际动作:', actions.length, '分派器:', dispatchers.length);

// 输出实际动作序列（前 100）
console.log('\n=== 实际执行的动作（前 120） ===');
actions.slice(0, 120).forEach(l => {
  console.log('#' + l.idx + ' pc=' + l.pc + ' op=' + l.op + ' → ' + l.action.slice(0, 110));
});

// 保存完整翻译
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_exec_translated.json', JSON.stringify({ actions, dispatchers, lines }, null, 1));
console.log('\n已保存 nx_exec_translated.json');
