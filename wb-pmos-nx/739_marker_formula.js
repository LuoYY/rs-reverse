/**
 * 739_marker_formula.js
 * 破解标记值（16k+8 位置）+ basearr 长度公式
 * 用全部样本（AgentB 8 + 本次 CDP）
 */
const fs = require('fs');
const path = require('path');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = []; let qi = 0;
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

(async () => {
  const samples = [];
  // AgentB v5 样本
  const v5 = JSON.parse(fs.readFileSync('/tmp/agentB/nx_multi_dataset_v5.json', 'utf8'));
  for (const s of v5.samples) {
    if (s.nsd === 88247) continue; // 多字节路径
    samples.push({ nsd: s.nsd, cd: s.cd, basearr: s.basearr });
  }
  // 本次 CDP（固定 67402）
  if (fs.existsSync('/tmp/nx_738_cap.json')) {
    const c = JSON.parse(fs.readFileSync('/tmp/nx_738_cap.json', 'utf8'));
    samples.push({ nsd: 67402, cd: c.cd, basearr: c.cap });
  }
  console.log('样本数:', samples.length);

  console.log('\n=== 标记值 vs b86 标记位置 + 候选 ===');
  for (const s of samples) {
    const b86 = decodeB86(s.cd);
    const b = s.basearr;
    console.log(`nsd=${s.nsd} len=${b.length}:`);
    console.log('  b86[0]=', b86[0], 'b86[1]=', b86[1], 'b86[2]=', b86[2]);
    const marks = [];
    for (let k = 0; k * 16 + 24 < b.length; k++) marks.push(24 + k * 16);
    for (const mp of marks) {
      console.log(`  [${mp}]: b86=${b86[mp + 2]} basearr=${b[mp]} | 段=[${b.slice(mp - 1, mp + 4).join(',')}]`);
    }
  }

  // basearr 长度分析：长度 vs b86 或 cd 长度
  console.log('\n=== 长度公式 ===');
  for (const s of samples) {
    const b86 = decodeB86(s.cd);
    console.log(`nsd=${s.nsd} basearr len=${s.basearr.length} b86 len=${b86.length} cd len=${s.cd.length}`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
