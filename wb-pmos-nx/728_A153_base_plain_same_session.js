/**
 * 728_A153_base_plain_same_session.js
 * 同会话（nsd=67402）明文 basearr（182）vs base（158）深层对比
 * 找 base 与明文的关系（分段/变换）
 */
const fs = require('fs');

(async () => {
  const capD = JSON.parse(fs.readFileSync('/tmp/nx_browser_cap_full.json', 'utf8'));
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_browser_base_full.json', 'utf8'));
  const plain = capD.head; // 只有 head 32 + tail（A139 只存了部分）
  console.log('明文 head[0-31]:', plain.join(','));
  console.log('base[0-31]:', baseD.base.slice(0, 32).join(','));

  // 明文长度 182，base 158。base 可能是明文的子集/压缩
  console.log('\n明文 len:', capD.len, 'base len:', baseD.base.length);

  // 关键：重新采集完整明文（182 全量）
  // 用 A139 的方式但保存完整数组——A139 只存了 head。需要重跑保存完整。
  // 先用现有数据做分析
  console.log('\n=== 明文 vs base 前 32 对比 ===');
  const x = [];
  for (let i = 0; i < 32; i++) x.push((plain[i] ^ baseD.base[i]) & 0xff);
  console.log('plain^base:', x.join(','));

  // base[22:] 与明文[24:] 关系（同会话）
  console.log('\nbase[22-40]:', baseD.base.slice(22, 41).join(','));
  // 明文 head 只有 32，无法看到 24+ 的完整明文
  console.log('明文 head 覆盖到 31');

  // 尝试从 b86[2:] 重建明文（每 16 字节第 8 字节替换规则）
  // 需要 cd → b86
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
  console.log('\nb86 len:', b86.length);
  // 明文 ≈ b86[2:2+182]（每 16 字节第 8 字节替换）
  const fb = b86.slice(2, 2 + 182);
  // 找明文与 b86 的差异（应该每 16 字节 1 处）
  // 但明文 head 只有 32：对比前 32
  const diffs = [];
  for (let i = 0; i < Math.min(32, plain.length, fb.length); i++) if (plain[i] !== fb[i]) diffs.push(i);
  console.log('明文 head vs b86[2:2+32] 差异:', diffs.join(','));
  console.log('b86[2:34]:', fb.slice(0, 32).join(','));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
