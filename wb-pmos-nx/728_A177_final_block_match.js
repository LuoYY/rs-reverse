/**
 * 728_A177_final_block_match.js
 * 最终逐块分析：base[22:]（随 cd）与明文 basearr[24:]（随 cd）同会话配对
 * base 固定头 22 + 明文固定头 24 对齐？
 * 分析 base[i+22] 与明文[i+24] 的关系（每块）
 */
const fs = require('fs');

(async () => {
  // 同会话：base(159) + 明文(130) + b86
  const base = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8')).base;
  const plain = JSON.parse(fs.readFileSync('/tmp/nx_browser_plain_full.json', 'utf8')).arr;
  const raw = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/412.raw', 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const cd = rawBody.match(/cd="([^"]+)"/)[1];

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
  const b86 = decodeB86(cd);

  console.log('base len:', base.length, '明文 len:', plain.length);
  console.log('base 固定头[0-21]:', base.slice(0, 22).join(','));
  console.log('明文固定头[0-23]:', plain.slice(0, 24).join(','));

  // 关键：base[22:] 与明文[24:] 长度差
  console.log('base[22:] len:', base.length - 22, '明文[24:] len:', plain.length - 24);

  // base 是否 = 明文的重排？base 长度(159) vs 明文(130) + 固定头(22) + 固定尾(10) = 162？
  console.log('\nbase(159) vs 明文(130)+固定头22+固定尾10=162: 差 -3');

  // base[22:] 每字节 vs 明文[24:] 每字节
  console.log('\n=== base[22:] vs 明文[24:] 逐字节 ===');
  console.log('base[22-40]:', base.slice(22, 41).join(','));
  console.log('明文[24-42]:', plain.slice(24, 43).join(','));

  // base[22:] 在 b86 中滑动（明文= b86[2:]，base 可变段可能 = b86 另一个偏移）
  console.log('\nbase[22:50] 在 b86 中搜索（精确）:');
  const seg = base.slice(22, 50);
  for (let off = 0; off < b86.length - 28; off++) {
    let m = 0;
    for (let i = 0; i < 28; i++) if (b86[off + i] === seg[i]) m++;
    if (m >= 20) console.log(`  off=${off}: 匹配 ${m}/28`);
  }

  // 明文值 → base 值映射（如果 base 是逐字节替换）
  console.log('\n=== 明文值→base 值映射（同会话）===');
  const map = {};
  for (let i = 0; i < Math.min(plain.length, base.length - 22); i++) {
    const p = plain[i], b = base[i + 22];
    if (!map[p]) map[p] = {};
    map[p][b] = (map[p][b] || 0) + 1;
  }
  for (const [p, bs] of Object.entries(map)) {
    const top = Object.entries(bs).sort((a, b) => b[1] - a[1])[0];
    if (Object.keys(bs).length === 1) console.log(`明文${p} → base${top[0]} (唯一)`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
