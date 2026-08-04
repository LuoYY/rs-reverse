/**
 * 734_marker_deep.js
 * 深度分析 8 个标记位置（24+16k）的值来源：
 * 1. 112832 vs 73823 标记值相同 → 完整 basearr 对比 + cd 对比
 * 2. 标记值 vs 相邻段数据的长度/校验
 * 3. 标记值 vs b86 其他位置
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
  const v5 = JSON.parse(fs.readFileSync('/tmp/agentB/nx_multi_dataset_v5.json', 'utf8'));
  const raw = fs.readFileSync(path.join(__dirname, '..', 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const cd67402 = rawBody.match(/cd="([^"]+)"/)[1];
  const m3 = JSON.parse(fs.readFileSync('/tmp/nx_multi_nsd3.json', 'utf8'));
  const mock = m3.find(s => s.src === 'mock');
  const all = [];
  for (const s of v5.samples) all.push({ nsd: s.nsd, cd: s.cd, basearr: s.basearr });
  if (mock) all.push({ nsd: 67402, cd: cd67402, basearr: mock.basearr });

  // 1. 112832 vs 73823
  const s1 = all.find(s => s.nsd === 112832);
  const s2 = all.find(s => s.nsd === 73823);
  if (s1 && s2) {
    console.log('=== 112832 vs 73823 ===');
    console.log('basearr 相同:', JSON.stringify(s1.basearr) === JSON.stringify(s2.basearr));
    console.log('cd 相同:', s1.cd === s2.cd);
    console.log('cd 长度:', s1.cd.length, s2.cd.length);
    // cd 差异位置
    let diffs = 0;
    for (let i = 0; i < Math.min(s1.cd.length, s2.cd.length); i++) if (s1.cd[i] !== s2.cd[i]) diffs++;
    console.log('cd 差异字符数:', diffs);
    console.log('cd 前 30:', s1.cd.substring(0, 30));
    console.log('         ', s2.cd.substring(0, 30));
  }

  // 2. 标记值 vs 段数据
  console.log('\n=== 标记值与段关系（每样本 9 段）===');
  for (const s of all) {
    if (s.nsd === 88247) continue;
    const b = s.basearr;
    console.log(`nsd=${s.nsd}:`);
    // 段划分：标记位置 24,40,56,72,88,104,120,136
    const marks = [24, 40, 56, 72, 88, 104, 120, 136];
    // 段1 [0-23], 段2 [25-39]（16 位置），段3 [41-55]...
    const segBounds = [];
    let prev = 0;
    for (const m of marks) { segBounds.push([prev, m]); prev = m + 1; }
    segBounds.push([prev, b.length]);
    for (let k = 0; k < segBounds.length; k++) {
      const [st, en] = segBounds[k];
      const seg = b.slice(st, en);
      const markVal = k < 8 ? b[marks[k]] : null;
      console.log(`  段${k}: [${st}-${en-1}] len=${seg.length} 标记值=${markVal} 数据=${seg.slice(0, 8).join(',')}`);
    }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
