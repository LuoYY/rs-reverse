/**
 * 733_marker_analysis.js
 * basearr vs b86[2:140]：验证"仅每 16 字节偏移 8 处差异"，分析标记值模式
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

  console.log('样本数:', all.length);
  const nonMarkers = [];
  for (const s of all) {
    const b86 = decodeB86(s.cd);
    const slice = b86.slice(2, 2 + s.basearr.length);
    // 找出所有差异位置（非标记位置是否全匹配）
    const diffs = [];
    for (let i = 0; i < s.basearr.length; i++) {
      if (slice[i] !== s.basearr[i]) diffs.push(i);
    }
    const markers = diffs.filter(i => i >= 24 && (i - 24) % 16 === 0);
    const nonM = diffs.filter(i => !(i >= 24 && (i - 24) % 16 === 0));
    nonMarkers.push(nonM);
    console.log(`nsd=${s.nsd}: 总差异=${diffs.length} 标记位置差异=${markers.length} 非标记差异=${nonM.length}${nonM.length ? ' → ' + nonM.join(',') : ''}`);
    // 打印标记位置的值
    const mvals = [];
    for (const i of markers) mvals.push(`${i}:${s.basearr[i]}`);
    console.log(`  标记值: ${mvals.join(' ')}`);
  }

  // 分析标记值模式：与相邻字节/b86 的关系
  console.log('\n=== 标记值与 b86 对应位置 ===');
  for (const s of all.slice(0, 4)) {
    const b86 = decodeB86(s.cd);
    console.log(`nsd=${s.nsd}:`);
    for (let k = 1; k < 9; k++) {
      const pos = 24 + (k - 1) * 16;
      console.log(`  [${pos}]: b86=${b86[pos]} basearr=${s.basearr[pos]} 前后=${s.basearr.slice(pos - 2, pos + 3).join(',')}`);
    }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
