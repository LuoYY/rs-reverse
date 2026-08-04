/**
 * 792_caplen_block.js
 * cap 长度 / base 长度 vs 块类型 的关系
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

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

// 全部样本（含 pairs 无 cap）
const rows = [];
for (const s of live) rows.push({ src: 'live', nsd: s.nsd, base: s.base179, cap: s.cap });
for (const s of pairs) rows.push({ src: 'pairs', nsd: s.nsd, base: s.base, cap: null });
for (const s of trip) rows.push({ src: 'triple', nsd: s.nsd, base: s.base, cap: s.cap });

const stats = {};
for (const r of rows) {
  const blk = findBlock(r.base);
  if (!blk) { console.log(`nsd=${r.nsd} 块? base.len=${r.base.length}`); continue; }
  if (!stats[blk.name]) stats[blk.name] = { bases: [], caps: [], starts: [] };
  stats[blk.name].bases.push(r.base.length);
  stats[blk.name].starts.push(blk.start);
  if (r.cap) stats[blk.name].caps.push(r.cap.length);
}
console.log('=== 块类型 vs 长度统计 ===');
for (const [b, s] of Object.entries(stats)) {
  console.log(`块${b}: base.len=[${s.bases}] (min=${Math.min(...s.bases)} max=${Math.max(...s.bases)}) 块起始=[${s.starts}] cap.len=[${s.caps}]`);
}

// cap 长度分组 vs 块类型（无 cap 的 pairs 用 cd 长度近似？）
console.log('\n=== cd 长度 vs 块类型 ===');
const cdLens = {};
for (const r of rows) {
  const blk = findBlock(r.base);
  if (!blk) continue;
  if (!cdLens[blk.name]) cdLens[blk.name] = [];
  // 用 cap 长度或 base 长度
  cdLens[blk.name].push(r.cap ? r.cap.length : r.base.length);
}
for (const [b, l] of Object.entries(cdLens)) console.log(`块${b}: len=[${l}]`);
