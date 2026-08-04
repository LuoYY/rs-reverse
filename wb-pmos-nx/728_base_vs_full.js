/**
 * 728_base_vs_full.js
 * 验证 base 是否与 basearrFull（170B 属性名列表）相关
 * basearrFull 是 fixed dataset 里的常量，可能出现在 base 的固定段
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

// 从 fixed dataset 读 basearrFull
let basearrFull = null;
try {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_fixed_dataset.json', 'utf8'));
  if (d.basearrFull) basearrFull = d.basearrFull.map(c => c);
  console.log('basearrFull len:', basearrFull && basearrFull.length, basearrFull && basearrFull.slice(0, 30).map(c => String.fromCharCode(c)).join(''));
} catch (e) { console.log('fixed dataset err:', e.message); }

// 打印 base 的固定段（所有会话共同段）
console.log('\n=== base 全量（8 会话对齐） ===');
const maxLen = Math.max(...samples.map(s => s.base.length));
for (const s of samples) {
  console.log(`nsd=${s.nsd}: ${s.base.join(',')}`);
}

// 找 base 中跨会话完全一致的最长段
console.log('\n=== base 共同段搜索 ===');
const s0 = samples[0].base;
let bestSeg = { start: -1, len: 0 };
for (let st = 0; st < s0.length; st++) {
  for (let L = 8; L < 60; L++) {
    if (st + L > s0.length) break;
    const seg = s0.slice(st, st + L).join(',');
    const allContain = samples.every(s => s.base.join(',').indexOf(seg) !== -1);
    if (allContain && L > bestSeg.len) bestSeg = { start: st, len: L };
  }
}
console.log('最长共同段:', bestSeg, '值:', s0.slice(bestSeg.start, bestSeg.start + bestSeg.len).join(','));

// basearrFull 若存在，检查与 base 的关系
if (basearrFull) {
  console.log('\n=== basearrFull vs base 固定段 ===');
  const encF = basearrFull;
  for (const s of samples) {
    // 尝试：base 是否包含 basearrFull 直接值？
    const bStr = s.base.join(',');
    const fStr = encF.join(',');
    console.log(`nsd=${s.nsd}: basearrFull 在 base 中 ${bStr.indexOf(fStr) !== -1 ? '直接出现' : '未直接出现'}`);
  }
  // basearrFull 可能经过 huffman 编码？
  console.log('\n=== basearrFull huffman 编码 ===');
  function getTree() {
    let arr = [];
    for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
    arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
    function parse(item) {
      for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } }
      arr.push(item);
    }
    while (arr.length > 1) {
      const [one, two] = arr.slice(0, 2);
      arr = arr.slice(2);
      parse({ total: one.total + two.total, first: one, second: two });
    }
    return arr[0];
  }
  function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
    if (tree.idx === undefined) {
      getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
      getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
    } else arr[tree.idx] = config;
    return arr;
  }
  const huffEncCfg = getEncCfg(getTree());
  function nxEncrypt(numarr) {
    const ans = [];
    let one = 0, two = 0;
    for (let i = 0; i < numarr.length; i++) {
      const cfg = huffEncCfg[numarr[i]];
      one = one << cfg.val | cfg.key;
      two += cfg.val;
      while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
    }
    if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
    return ans;
  }
  const hf = nxEncrypt(encF);
  console.log('basearrFull huffman 编码 len:', hf.length, '前16:', hf.slice(0, 16).join(','));
  for (const s of samples) {
    const bStr = s.base.join(',');
    const hStr = hf.join(',');
    console.log(`nsd=${s.nsd}: huff(basearrFull) 在 base 中 ${bStr.indexOf(hStr) !== -1 ? '直接出现' : '未直接出现'}`);
  }
}
