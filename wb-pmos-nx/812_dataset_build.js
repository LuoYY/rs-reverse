/**
 * 812_dataset_build.js 整理 36 样本标准化验证数据集
 * 统一格式: {nsd, src, cd, cap, base, keys2, block, pair22, env68, env73}
 * 输出 /tmp/nx_vm_verify_dataset.json
 */
const fs = require('fs');

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decodeB86(str) {
  const idxmap = {};
  for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = [];
  let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

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
      if (ok) return name;
    }
  }
  return '?';
}

const out = [];

// 1. 实时 8 样本（含 cd/cap/base/keys2）
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
for (const s of live) {
  out.push({
    nsd: s.nsd, src: 'live', group: s.nsd, cd: s.cd, cap: s.cap, base: s.base179, keys2: s.keys2,
    block: findBlock(s.base179), pair22: s.base179.slice(22, 29), env68: s.base179.slice(68, 75),
    env73: s.base179.slice(68, 73), beLen: s.beLen,
  });
}

// 2. IO 对 16（8 实时重叠去重 + 8 triple）
const io = JSON.parse(fs.readFileSync('/tmp/nx_io_pairs.json', 'utf8'));
const liveNsds = new Set(live.map(s => s.nsd));
for (const s of io) {
  if (liveNsds.has(s.nsd)) continue;
  out.push({
    nsd: s.nsd, src: 'triple', group: s.nsd, cd: null, cap: s.cap, base: s.base, keys2: null,
    block: findBlock(s.base), pair22: s.base.slice(22, 29), env68: s.base.slice(68, 75),
    env73: s.base.slice(68, 73),
  });
}

// 3. A236 12 样本（同 nsd 组）
const a236 = JSON.parse(fs.readFileSync('/tmp/nx_A236_blocks.json', 'utf8'));
const a236arr = Array.isArray(a236) ? a236 : Object.values(a236);
for (const s of a236arr) {
  out.push({
    nsd: s.name, src: 'a236', group: 'A236', cd: null, cap: null, base: s.base, keys2: null,
    block: findBlock(s.base), pair22: s.base.slice(22, 29), env68: s.base.slice(68, 75),
    env73: s.base.slice(68, 73), env: s.env,
  });
}

fs.writeFileSync('/tmp/nx_vm_verify_dataset.json', JSON.stringify(out, null, 1));
console.log('总样本:', out.length);
console.log('\n=== 样本清单 ===');
for (const s of out) {
  console.log(`[${s.src} ${s.nsd}] block=${s.block} pair22=[${s.pair22.join(',')}] env68=[${s.env68.join(',')}] base.len=${s.base.length}${s.cap ? ' cap=' + s.cap.length : ''}${s.keys2 ? ' k2=' + s.keys2.length : ''}`);
}

// 分组统计
console.log('\n=== 同 cd 组（A236）配对/环境编码 ===');
for (const s of out.filter(x => x.src === 'a236')) {
  console.log(`[${s.nsd}] block=${s.block} env73=[${s.env73.join(',')}] env68=[${s.env68.join(',')}] pair26=[${s.pair22.slice(4, 7).join(',')}]`);
}

// [68:73] 唯一模式数（跨样本）
const env73Set = new Set(out.map(s => s.env73.join(',')));
console.log('\n[68:73] 唯一模式数:', env73Set.size);
for (const e of env73Set) console.log(' ', e);

// 块类型分布
const blockCnt = {};
for (const s of out) blockCnt[s.block] = (blockCnt[s.block] || 0) + 1;
console.log('\n块类型分布:', JSON.stringify(blockCnt));
