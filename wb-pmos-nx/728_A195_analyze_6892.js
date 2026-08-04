/**
 * 728_A195_analyze_6892.js
 * 分析 base[68:92]（24B 最后障碍）与 cap/keys2/keys17/b86 的关系（同会话）
 */
const fs = require('fs');

(async () => {
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  const base = baseD.base, keys2 = baseD.keys2, keys17 = baseD.keys17;
  const plain = JSON.parse(fs.readFileSync('/tmp/nx_browser_plain_full.json', 'utf8')).arr;

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
  const raw = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/412.raw', 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const cd = rawBody.match(/cd="([^"]+)"/)[1];
  const b86 = decodeB86(cd);

  console.log('base len:', base.length, 'plain len:', plain.length, 'b86 len:', b86.length);

  // base[68:92]（team-lead: len=165 样本）——我的样本 len=159
  // 我的样本结构：按 team-lead 边界试切
  console.log('\n=== base 分段（team-lead 结构）===');
  console.log('base[0-21] 固定头:', base.slice(0, 22).join(','));
  console.log('base[22-28] 会话段:', base.slice(22, 29).join(','));
  console.log('base[29-67] 固定段:', base.slice(29, 68).join(','));
  console.log('base[68:92] 可变段:', base.slice(68, 92).join(','));
  console.log('base[92:116] 准固定:', base.slice(92, 116).join(','));
  console.log('base[116:] 固定尾:', base.slice(116).join(','));

  // 分析 base[68:92] 与明文的关系
  console.log('\n=== base[68:92] vs 明文/keys ===');
  const seg = base.slice(68, 92);
  // 与明文各段对比（滑动）
  for (let off = 0; off <= plain.length - 24; off++) {
    let m = 0;
    for (let i = 0; i < 24; i++) if (plain[off + i] === seg[i]) m++;
    if (m >= 6) console.log(`明文[${off}:${off + 24}] 与 base[68:92] 匹配 ${m}/24`);
  }
  // 与 b86 对比
  for (let off = 0; off <= b86.length - 24; off++) {
    let m = 0;
    for (let i = 0; i < 24; i++) if (b86[off + i] === seg[i]) m++;
    if (m >= 6) console.log(`b86[${off}:${off + 24}] 与 base[68:92] 匹配 ${m}/24`);
  }

  // 与 keys2 XOR
  console.log('\nbase[68:92]^keys2[0:24]:', seg.map((v, i) => (v ^ keys2[i]) & 0xff).join(','));
  console.log('base[68:92]^keys17:', seg.map((v, i) => (v ^ keys17[i % 16]) & 0xff).join(','));

  // base[68:92] 值分布
  console.log('\nbase[68:92] 值:', seg.join(','));
  console.log('明文值域:', [...new Set(plain)].sort((a, b) => a - b).join(','));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
