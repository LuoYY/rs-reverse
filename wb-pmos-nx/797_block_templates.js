/**
 * 797_block_templates.js
 * 提取各块类型的完整模板（前导+核心+块特有尾+公共段），为完整替换实验做准备
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;
const a236 = JSON.parse(fs.readFileSync('/tmp/nx_A236_blocks.json', 'utf8'));
const a236arr = Array.isArray(a236) ? a236 : Object.values(a236);

const samples = [];
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, base: s.base179 });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, base: s.base });
for (const s of a236arr) samples.push({ src: 'a236', nsd: s.name, base: s.base });

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
      if (ok) return { name, start, coreLen: core.length };
    }
  }
  return null;
}

// 公共段锚点（尾部固定段）: 从尾部 t=28 起 [202,156,93,134,194,236,25,97,68,217,159,0,102,0,143,144,111,222,85,222,13,15,193,124,69,26,121,132,159,68,0,0,0]
// 更简单的锚点：从尾部 t=17 起 [159,0,102,0,143,144,111,222,85,222,13,15,193,124,69,26,121,132,159,68,0,0,0]
const ANCHOR = [159, 0, 102, 0, 143, 144, 111, 222, 85, 222];
// 找每个样本中 ANCHOR 的位置（从开头数）
console.log('=== 各样本块区结构（块起、块尾、公共段锚点）===');
for (const s of samples) {
  const b = s.base;
  const blk = findBlock(b);
  let anchorPos = -1;
  for (let i = b.length - 30; i >= 0; i--) {
    let ok = true;
    for (let k = 0; k < ANCHOR.length; k++) {
      if (b[i + k] !== ANCHOR[k]) { ok = false; break; }
    }
    if (ok) { anchorPos = i; break; }
  }
  if (blk) {
    const coreEnd = blk.start + blk.coreLen;
    const tailSeg = b.slice(coreEnd, anchorPos >= 0 ? anchorPos : coreEnd + 20);
    console.log(`[${s.src} ${s.nsd}] len=${b.length} 块${blk.name}@${blk.start} 核心尾=${coreEnd} 锚点@${anchorPos} 块尾段=[${tailSeg.join(',')}]`);
  } else {
    console.log(`[${s.src} ${s.nsd}] len=${b.length} 块? 锚点@${anchorPos}`);
  }
}
