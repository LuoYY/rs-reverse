/**
 * 728_B_markers_68_92.js
 * base[68:92] vs 明文basearr markers (cap[24+16k] 8位置)
 * 可能：base[68:92] 编码了 markers 值
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;
const NORMAL = samples.filter(s => s.base[26] === 233);

console.log('=== base[68:92] vs cap markers ===');
for (const s of NORMAL) {
  const seg = s.base.slice(68, 92);
  const mk = [24, 40, 56, 72, 88, 104, 120, 136].map(p => s.cap[p]);
  console.log(`nsd=${s.nsd}:`);
  console.log(`  base[68:92]: ${seg.join(',')}`);
  console.log(`  cap markers: ${mk.join(',')}`);
}

// markers 是否出现在 base[68:92] 中
console.log('\n=== cap markers 在 base[68:92] 中 ===');
for (const s of NORMAL) {
  const seg = s.base.slice(68, 92);
  const mk = [24, 40, 56, 72, 88, 104, 120, 136].map(p => s.cap[p]);
  const found = mk.filter(v => seg.includes(v));
  console.log(`nsd=${s.nsd}: markers 命中 ${found.length}/8 → [${found.join(',')}]`);
}
