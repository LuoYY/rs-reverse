/**
 * 817_hardcode_tables.js 整理硬编码数据表（供 Go 端内嵌）
 * 输出 /tmp/nx_hardcode_tables.json:
 * - fixedHead [0:22]
 * - fixedTail [137:]（尾部对齐 33B）
 * - fingerprintTemplates [29:68] 13 种
 * - blockTemplates 6 种
 * - bitsConstraint 说明
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;
const a236 = JSON.parse(fs.readFileSync('/tmp/nx_A236_blocks.json', 'utf8'));
const a236arr = Array.isArray(a236) ? a236 : Object.values(a236);

const samples = [];
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, base: s.base179 });
for (const s of pairs) samples.push({ src: 'pairs', nsd: s.nsd, base: s.base });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, base: s.base });
for (const s of a236arr) samples.push({ src: 'a236', nsd: s.name, base: s.base });

// 固定头
const head = samples[0].base.slice(0, 22);

// 固定尾（尾部对齐 33B）
const tailLen = 33;
const tailCounts = {};
for (const s of samples) {
  const tail = s.base.slice(s.base.length - tailLen);
  const key = tail.join(',');
  tailCounts[key] = (tailCounts[key] || 0) + 1;
}
const fixedTail = Object.entries(tailCounts).sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
console.log('固定尾(33B) 一致性:', Object.keys(tailCounts).length === 1 ? '全一致' : `${Object.keys(tailCounts).length}种`, '主导:', fixedTail.join(','));

// 指纹模板 [29:68]
const fpGroups = {};
for (const s of samples) {
  const seg = s.base.slice(29, 68).join(',');
  (fpGroups[seg] ||= []).push(s);
}
const fingerprintTemplates = Object.entries(fpGroups).map(([seg, list]) => ({
  template: seg.split(',').map(Number),
  count: list.length,
  samples: list.map(s => `${s.src}:${s.nsd}`),
  env73: list.map(s => s.base.slice(68, 73).join(',')),
  baseLen: [...new Set(list.map(s => s.base.length))],
}));
console.log('指纹模板数:', fingerprintTemplates.length);

// 块模板
const blockTemplates = {
  A: [76, 0, 25, 10, 171, 221, 218, 233, 234],
  B: [49, 144, 170, 189, 221, 174, 158, 169],
  A2: [105, 171, 119, 0, 221, 218, 233, 234],
  C: [249, 117, 222, 42, 169, 237, 173],
  D: [77, 158, 17, 7, 119, 143, 23, 17],
  E: [100, 217, 225, 16, 119, 121, 241, 113],
};

// huffman lenMap（bits 约束用）
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
const lenMap = {};
for (let i = 0; i < 256; i++) lenMap[i] = huffEncCfg[i] ? huffEncCfg[i].val : null;

// 各块模板的 bits 与编码长度
const blockBits = {};
for (const [name, core] of Object.entries(blockTemplates)) {
  blockBits[name] = {
    bits: core.reduce((a, v) => a + lenMap[v], 0),
    bitsEach: core.map(v => lenMap[v]),
  };
}
console.log('\n块模板 bits:', JSON.stringify(blockBits, null, 1));

const tables = {
  fixedHead: head,
  fixedTail: fixedTail,
  fingerprintTemplates: fingerprintTemplates,
  blockTemplates: blockTemplates,
  blockBits: blockBits,
  bitsConstraint: {
    note: 'huffman 编码后总 bits 必须保持（WAF 校验）。构造 base 时任意修改后需保证总 bits 与目标一致；[110:] 是自由补偿区（bits 变化不触发 WAF）',
    huffLenMap: lenMap,
  },
};
fs.writeFileSync('/tmp/nx_hardcode_tables.json', JSON.stringify(tables, null, 1));
console.log('\n已保存 /tmp/nx_hardcode_tables.json');

// [110:137] 变体区与环境因子
console.log('\n=== [110:137] 变体区分析 ===');
for (const s of a236arr) {
  const b = s.base;
  const fix = b.length - 33;
  const varZone = b.slice(Math.max(68, fix - 27), fix);
  const marker = b[fix - 27]; // 变体区开头
  console.log(`[${s.name}] len=${b.length} env=${JSON.stringify(s.env)} 变体区前8=${varZone.slice(0, 8).join(',')} 变体区后20=${varZone.slice(-20).join(',')}`);
}
