// 提取 pc=265 附近的指令程序块 + 所有 pc 入口分析
const d = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_exec_exact.json');
const calls = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_c4_calls.json');

// 1. 找 pc=265 的程序块（去重 pc 后按顺序）
console.log('=== pc=265 前后指令（去重顺序） ===');
const seen = new Set();
d.forEach(x => {
  if (!seen.has(x.pc)) seen.add(x.pc);
});
// 按执行顺序显示 265 附近
const order = [];
seen.clear();
d.forEach(x => {
  if (!seen.has(x.pc)) { seen.add(x.pc); order.push(x); }
});
for (let i = 0; i < order.length; i++) {
  if (order[i].pc === 265) {
    for (let j = Math.max(0, i - 3); j <= Math.min(order.length - 1, i + 20); j++) {
      const o = order[j];
      console.log('  #' + j + ' idx' + o.idx + ' pc=' + o.pc + ' op=' + o.op + ' ' + o.code.slice(0, 90));
    }
    break;
  }
}

// 2. 所有 _$c4 调用的 PC 分布
console.log('\n=== _$c4 调用 PC 分布 ===');
const pcFreq = {};
calls.forEach(c => {
  const p0 = c.split('|')[0];
  pcFreq[p0] = (pcFreq[p0] || 0) + 1;
});
Object.entries(pcFreq).sort((a, b) => a[0] - b[0]).forEach(([pc, n]) => {
  console.log('  pc=' + pc + ' ×' + n);
});
