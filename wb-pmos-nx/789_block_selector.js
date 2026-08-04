/**
 * 789_block_selector.js
 * 分析 base[80:92] 前导（块选择器）与块核心的配对关系
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

const samples = [];
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, base: s.base179 });
for (const s of pairs) samples.push({ src: 'pairs', nsd: s.nsd, base: s.base });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, base: s.base });

// 块核心定义（team-lead 16样本）
const CORES = {
  B: [49, 144, 170, 189, 221, 174, 158, 169],
  A2: [105, 171, 119, 0, 221, 218, 233, 234],
  C: [249, 117, 222, 42, 169, 237, 173],
  D: [77, 158, 17, 7, 119, 143, 23, 17],
  E: [100, 217, 225, 16, 119, 121, 241, 113],
  A: [76, 0, 25, 10, 171, 221, 218, 233, 234],
};

// 从 base 中找块核心位置和类型
function findBlock(base) {
  for (const [name, core] of Object.entries(CORES)) {
    for (let start = 78; start <= 86; start++) {
      let ok = true;
      for (let k = 0; k < core.length; k++) {
        if (base[start + k] !== core[k]) { ok = false; break; }
      }
      if (ok) return { name, start };
    }
  }
  return null;
}

console.log('=== 各样本块类型 + 块起始 + 前导(块前3B) + 尾(块后) ===');
for (const s of samples) {
  const blk = findBlock(s.base);
  if (!blk) { console.log(`[${s.src} ${s.nsd}] len=${s.base.length} 块?`); continue; }
  const lead = s.base.slice(blk.start - 3, blk.start);
  const tail = s.base.slice(blk.start + CORES[blk.name].length, blk.start + CORES[blk.name].length + 4);
  console.log(`[${s.src} ${s.nsd}] len=${s.base.length} 块${blk.name}@${blk.start} 前导=[${lead.join(',')}] 尾=[${tail.join(',')}]`);
}

// 前导与块类型的配对
console.log('\n=== 前导 vs 块类型 ===');
const leadMap = {};
for (const s of samples) {
  const blk = findBlock(s.base);
  if (!blk) continue;
  const lead = s.base.slice(blk.start - 3, blk.start).join(',');
  const tail1 = s.base[blk.start + CORES[blk.name].length];
  const key = `块${blk.name} 前导=[${lead}]`;
  (leadMap[key] ||= []).push({ nsd: s.nsd, len: s.base.length, tail1, src: s.src });
}
for (const [k, v] of Object.entries(leadMap)) {
  console.log(`${k} (${v.length}): ${v.map(x => `${x.nsd}(len${x.len})`).join(' ')}`);
}

// 前导中哪些字节跨块类型不同（选择器候选）
console.log('\n=== 前导候选选择器分析 ===');
for (const s of samples) {
  const blk = findBlock(s.base);
  if (!blk) continue;
  const lead = s.base.slice(blk.start - 3, blk.start);
  console.log(`nsd=${s.nsd} 块${blk.name}@${blk.start}: lead3=[${lead.join(',')}] lead全(68..start)=[${s.base.slice(68, blk.start + 1).join(',')}]`);
}
