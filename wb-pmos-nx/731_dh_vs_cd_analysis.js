/**
 * 731_dh_vs_cd_analysis.js
 * 分析 dh（=basearr，<128 透传）与 cd 派生数据的关系
 * 用 AgentB 采集的 8 样本（含完整 cd）
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

// decodeB86（559 号）
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
  const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_multi_dataset_v5.json', 'utf8'));
  const samples = data.samples;
  console.log('样本数:', samples.length);

  for (const s of samples) {
    const dh = s.basearr;
    const cd = s.cd;
    const b86 = decodeB86(cd);
    console.log(`\n=== nsd=${s.nsd} ===`);
    console.log('dh len:', dh.length, 'b86 len:', b86 ? b86.length : 'null');
    console.log('dh[0-15]:', dh.slice(0, 16).join(','));
    console.log('b86[0-15]:', b86 ? b86.slice(0, 16).join(',') : '');
    console.log('cd[0]:', cd.charCodeAt(0), 'dh[0]:', dh[0]);
    console.log('cd[1]:', cd.charCodeAt(1), 'dh[1]:', dh[1]);

    // 关系尝试：dh[i] vs cd[i]、b86[i]、b86[i+offset]
    // 1. dh == b86 前 138？
    if (b86) {
      let eq138 = true;
      for (let i = 0; i < Math.min(138, b86.length); i++) if (dh[i] !== b86[i]) { eq138 = false; break; }
      console.log('dh == b86[:138]:', eq138);
      // 2. dh == b86 后 138？
      let eqTail = true;
      const tail = b86.slice(b86.length - 138);
      for (let i = 0; i < 138; i++) if (dh[i] !== tail[i]) { eqTail = false; break; }
      console.log('dh == b86 尾138:', eqTail);
      // 3. 找 dh 在 b86 中的位置（子串匹配）
      let found = -1;
      for (let o = 0; o + 138 <= b86.length; o++) {
        let ok = true;
        for (let i = 0; i < 138; i++) if (dh[i] !== b86[o + i]) { ok = false; break; }
        if (ok) { found = o; break; }
      }
      console.log('dh 在 b86 中偏移:', found);
      // 4. dh vs b86 的异或/差值
      let xorEq = true, diffEq = true;
      for (let i = 0; i < 138; i++) {
        if (b86[i] !== undefined && (dh[i] !== (b86[i] ^ 0x41))) xorEq = false;
        if (b86[i] !== undefined && (dh[i] !== b86[i] + 113)) diffEq = false;
      }
      console.log('dh == b86^0x41:', xorEq, 'dh == b86+113:', diffEq);
    }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
