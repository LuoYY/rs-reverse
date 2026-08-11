// 从反汇编重建 aebi[1]（2553 条 opcode）
// 反汇编格式: pc=N op=M: ...
const fs = require('fs');
const disasm = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_aebi_disasm_full.txt', 'utf8').split('\n');
const aebi = [];
for (const line of disasm) {
  const m = line.match(/^pc=(\d+)\s+op=(\d+)/);
  if (m) aebi[+m[1]] = +m[2];
}
// 填充空洞
const len = Math.max(...aebi.map((v, i) => i));
console.log('aebi[1] len:', len + 1);
console.log('非空条目:', aebi.filter(v => v !== undefined).length);
console.log('前 10:', aebi.slice(0, 10).join(','));
// 空洞数量
let holes = 0;
for (let i = 0; i <= len; i++) if (aebi[i] === undefined) holes++;
console.log('空洞:', holes);

// 检查这是否 = $_ts.aebi 的格式（aebi[1] = opcode 数组）
// dynCode 中 _$lP[1] = aebi[1]，_$bk=_$lP[1] 主循环
// aebi 可能有多层（6 段），[1] 是主指令流
// 保存为可加载格式
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_aebi1.json', JSON.stringify(aebi));
console.log('saved nx_aebi1.json');
