/**
 * 793_a236_blocks.js 分析 A236 同 nsd 6 样本的块类型
 */
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/tmp/nx_A236_blocks.json', 'utf8'));
const arr = Array.isArray(data) ? data : Object.values(data);

const CORES = {
  A: [76, 0, 25, 10, 171, 221, 218, 233, 234],
  B: [49, 144, 170, 189, 221, 174, 158, 169],
  A2: [105, 171, 119, 0, 221, 218, 233, 234],
  C: [249, 117, 222, 42, 169, 237, 173],
  D: [77, 158, 17, 7, 119, 143, 23, 17],
  E: [100, 217, 225, 16, 119, 121, 241, 113],
};
function findBlock(base) {
  for (const [name, core] of Object.entries(CORES)) {
    for (let start = 75; start <= 92; start++) {
      let ok = true;
      for (let k = 0; k < core.length; k++) {
        if (base[start + k] !== core[k]) { ok = false; break; }
      }
      if (ok) return { name, start };
    }
  }
  return null;
}

console.log('=== A236 6 样本 ===');
for (const s of arr) {
  const b = s.base;
  const blk = findBlock(b);
  console.log(`[${s.name}] base.len=${b.length} 块=${blk ? blk.name + '@' + blk.start : '?'} [22:30]=${b.slice(22,30).join(',')} [68:92]=${b.slice(68,92).join(',')}`);
}

// 对比 base[0:22] 是否固定
console.log('\n=== base[0:22] 一致性 ===');
const head = arr[0].base.slice(0, 22).join(',');
let allSame = true;
for (const s of arr) {
  const h = s.base.slice(0, 22).join(',');
  if (h !== head) { allSame = false; console.log(`${s.name} 头不同`); }
}
console.log('全部一致:', allSame, '=', head);

// 会话段 [22:29] 变化
console.log('\n=== 会话段 [22:29] ===');
for (const s of arr) console.log(`${s.name}: [22:29]=${s.base.slice(22,29).join(',')} [26:29]=${s.base.slice(26,29).join(',')}`);
