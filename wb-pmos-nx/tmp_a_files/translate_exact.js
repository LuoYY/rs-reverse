// 精确翻译：从 _$c4 源码提取 opcode 精确语义 × 执行流 → 真实执行代码
// 方法：解析 _$c4 的区间树结构，为每个 opcode 提取叶子分支代码
const fs = require('fs');
const stream = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_stream_trace.json');
const tables = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const ou = tables._$oU.val;
const k0 = tables._$k0.val;

// 解析 _$c4 的 opcode 语义
// 结构：if(_$pW<N){...}else if(_$pW===X){CODE}else{...}
// 嵌套区间树。为简化，提取所有 "===N){CODE" 模式
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
const semMap = {};
// 提取 _$pW===N){CODE  （CODE 到匹配的 } 或分号）
const re = /_\$pW===(\d+)\)\{([^}]*?)\}/g;
let m;
while ((m = re.exec(c4))) {
  const op = +m[1];
  let code = m[2];
  // 处理嵌套（code 内可能含 }，但 [^}]* 已排除）
  semMap[op] = code.trim();
}
console.log('提取的 opcode 语义数:', Object.keys(semMap).length);

// 检查关键 opcode
[620, 812, 393, 405, 1493, 6].forEach(op => {
  console.log('op=' + op + ' → ' + (semMap[op] || 'N/A').slice(0, 80));
});

// 替换 _$oU[N]/_$k0[N]
function resolve(code) {
  let c = code.replace(/_$oU\[(\d+)\]/g, (mm, i) => ou[+i] !== undefined ? JSON.stringify(ou[+i]) : mm);
  c = c.replace(/_$k0\[(\d+)\]/g, (mm, i) => k0[+i] !== undefined ? String(k0[+i]) : mm);
  return c;
}

// 翻译执行流
const actions = [];
let skipped = 0;
stream.forEach((t, idx) => {
  const raw = semMap[t.op];
  if (raw === undefined) { skipped++; return; }
  // 过滤分派器（只含跳转/比较）
  const isDispatch = /_$g6\+=|_$oJ=/.test(raw) && raw.length < 30;
  if (isDispatch) { skipped++; return; }
  const resolved = resolve(raw).replace(/\s+/g, ' ').trim();
  actions.push({ idx, pc: t.pc, op: t.op, code: resolved });
});

console.log('实际动作数:', actions.length, '跳过(分派/未知):', skipped);
console.log('\n=== 精确执行动作（前 100） ===');
actions.slice(0, 100).forEach(a => {
  console.log('#' + a.idx + ' pc=' + a.pc + ' op=' + a.op + ' → ' + a.code.slice(0, 110));
});

fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_exec_exact.json', JSON.stringify(actions, null, 1));
