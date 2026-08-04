/**
 * 728_A180_plain_b86_align.js
 * 明文 basearr 块与 b86 块的 16 字节对齐关系
 * 明文块是否 = b86 窗口移位？明文 = b86[2:] 但每块偏移 8 字节替换？
 */
const fs = require('fs');

(async () => {
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

  console.log('明文 len:', plain.length);
  console.log('明文块与 b86 块对齐（每 16 字节块滑动找最佳匹配）:');
  for (let bi = 0; bi < plain.length; bi += 16) {
    const block = plain.slice(bi, bi + 16);
    // 在 b86 中找最佳匹配偏移
    let best = { off: -1, m: 0 };
    for (let off = 0; off <= b86.length - 16; off++) {
      let m = 0;
      for (let i = 0; i < 16; i++) if (b86[off + i] === block[i]) m++;
      if (m > best.m) best = { off, m };
    }
    // 检查是否 = b86[bi+2:bi+18] 附近（明文 = b86[2:] 假设）
    const aligned = b86.slice(bi + 2, bi + 18);
    let aMatch = 0;
    for (let i = 0; i < 16; i++) if (aligned[i] === block[i]) aMatch++;
    console.log(`明文块@${bi}: 最佳b86偏移=${best.off}(匹配${best.m}/16), 对齐b86[${bi+2}](匹配${aMatch}/16)`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
