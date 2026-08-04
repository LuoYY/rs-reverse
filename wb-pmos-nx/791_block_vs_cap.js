/**
 * 791_block_vs_cap.js
 * 找 cap 中与块类型一一对应的位置（区分性分析）
 * 块类型绑定样本，需找决定因子
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

const pairs = [];
for (const s of live) pairs.push({ src: 'live', nsd: s.nsd, cap: s.cap, base: s.base179 });
for (const s of trip) pairs.push({ src: 'triple', nsd: s.nsd, cap: s.cap, base: s.base });

const CORES = {
  B: [49, 144, 170, 189, 221, 174, 158, 169],
  A2: [105, 171, 119, 0, 221, 218, 233, 234],
  C: [249, 117, 222, 42, 169, 237, 173],
  D: [77, 158, 17, 7, 119, 143, 23, 17],
  E: [100, 217, 225, 16, 119, 121, 241, 113],
};
function findBlock(base) {
  for (const [name, core] of Object.entries(CORES)) {
    for (let start = 78; start <= 88; start++) {
      let ok = true;
      for (let k = 0; k < core.length; k++) {
        if (base[start + k] !== core[k]) { ok = false; break; }
      }
      if (ok) return { name, start };
    }
  }
  return null;
}

const labeled = pairs.map(p => {
  const blk = findBlock(p.base);
  return { ...p, block: blk ? blk.name : '?', start: blk ? blk.start : -1 };
}).filter(p => p.block !== '?');
console.log('带标签样本:', labeled.length);

// 1. cap 中与块类型"完全对应"的位置（同块同值）
console.log('\n=== cap 位置 vs 块类型 一一对应 ===');
const capMax = Math.min(...labeled.map(p => p.cap.length));
for (let i = 0; i < capMax; i++) {
  const map = {};
  for (const p of labeled) {
    const v = p.cap[i];
    if (!map[p.block]) map[p.block] = new Set();
    map[p.block].add(v);
  }
  const allSingle = Object.values(map).every(s => s.size === 1);
  if (allSingle) {
    console.log(`cap[${i}]: 各块单值 ${Object.entries(map).map(([b, s]) => `${b}=${[...s][0]}`).join(' ')}`);
  }
}

// 2. cap[1] 与块
console.log('\n=== cap[1] vs 块 ===');
const c1 = {};
for (const p of labeled) (c1[p.block] ||= new Set()).add(p.cap[1]);
for (const [b, s] of Object.entries(c1)) console.log(`块${b}: cap[1]=${[...s]}`);

// 3. 关键：base[68] 与块类型
console.log('\n=== base[68] vs 块 ===');
const b68 = {};
for (const p of labeled) (b68[p.block] ||= new Set()).add(p.base[68]);
for (const [b, s] of Object.entries(b68)) console.log(`块${b}: base[68]=${[...s]}`);

// 4. 块起始 vs base 长度
console.log('\n=== 块起始/长度 vs 块类型 ===');
for (const p of labeled) console.log(`nsd=${p.nsd} 块${p.block}@${p.start} base.len=${p.base.length} cap.len=${p.cap.length}`);

// 5. cap 动态位置（排除标记）与块类型组合（尝试两位置组合）
console.log('\n=== cap 两位置组合 vs 块类型 ===');
const marks = [24, 40, 56, 72, 88, 104, 120, 136, 152, 168];
for (let i = 1; i < 40; i++) {
  if (marks.includes(i)) continue;
  for (let j = i + 1; j < 40; j++) {
    if (marks.includes(j)) continue;
    const map = {};
    for (const p of labeled) {
      const key = `${p.cap[i]},${p.cap[j]}`;
      if (!map[key]) map[key] = new Set();
      map[key].add(p.block);
    }
    // 如果每个组合只对应一种块
    const ok = Object.values(map).every(s => s.size === 1) && Object.keys(map).length >= 4;
    if (ok) {
      console.log(`★ cap[${i}],cap[${j}] 组合→块: ${Object.entries(map).map(([k, s]) => `(${k})→${[...s][0]}`).join(' ')}`);
    }
  }
}
