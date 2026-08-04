/**
 * 728_B_final_deliverable.js
 * 最终交付分析：base179 完整结构 + 动态段 [68:92] 与 cd/会话段的关系
 * 目标：纯算法生成 base179 的可行性判定
 */
const fs = require('fs');
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

console.log('============================================');
console.log(' base179 完整结构（pairs 10 样本）');
console.log('============================================');

// 1. 固定段 [0:22] + [29:68]
const head = pairs[0].base.slice(0, 22);
const mid = pairs[0].base.slice(29, 68);
let headOK = true, midOK = true;
for (const s of pairs) {
  if (JSON.stringify(s.base.slice(0, 22)) !== JSON.stringify(head)) headOK = false;
  if (JSON.stringify(s.base.slice(29, 68)) !== JSON.stringify(mid)) midOK = false;
}
console.log(`[0:22] 固定头 ${headOK ? '✓' : '✗'}: ${head.join(',')}`);
console.log(`[29:68] 固定段 ${midOK ? '✓' : '✗'}: ${mid.join(',')}`);

// 2. 会话段 [22:29] 模式
console.log('\n[22:29] 会话段模式:');
const segModes = {};
for (const s of pairs) {
  const seg = s.base.slice(22, 29).join(',');
  segModes[seg] = (segModes[seg] || 0) + 1;
}
for (const [k, v] of Object.entries(segModes)) console.log(`  [${k}] ×${v}`);

// 3. 固定尾 [92:len] 模式（尾部对齐）
console.log('\n[92:] 固定尾模式:');
const tailModes = {};
for (const s of pairs) {
  const tail = s.base.slice(92).join(',');
  tailModes[tail] = (tailModes[tail] || 0) + 1;
}
for (const [k, v] of Object.entries(tailModes)) {
  console.log(`  [${k.slice(0, 80)}...] ×${v}`);
}

// 4. [68:92] 动态段 vs 会话段 [22:26] 的关系
console.log('\n[68:92] 动态段 vs [22:26]:');
for (const s of pairs) {
  console.log(`nsd=${s.nsd} [22:26]=${s.base.slice(22, 26).join(',')} [68:92]=${s.base.slice(68, 92).join(',')}`);
}

// 5. 动态段内部结构：是否与 cap 的 [24:30] 相关（triple 有 cap）
console.log('\n[68:92] vs cap 动态段（triple 样本）:');
for (const s of trip) {
  console.log(`nsd=${s.nsd} base[68:92]=${s.base.slice(68, 92).join(',')}`);
  console.log(`  cap[24:30]=${s.cap.slice(24, 30).join(',')}`);
}

// 6. 分析 [68:92] 是否可从 [0:68] 固定段推导（如 huffman 编码的 24 字节数据）
console.log('\n[68:92] 与固定段的关系（XOR 固定段）:');
const f68 = pairs[0].base.slice(68, 92);
for (const s of pairs.slice(1, 4)) {
  const x = s.base.slice(68, 92).map((v, i) => v ^ f68[i]);
  console.log(`nsd=${s.nsd}: [68:92]^[68:92]ref = ${x.join(',')}`);
}
