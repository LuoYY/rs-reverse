/**
 * 728_A187_base_plain_keys_final.js
 * 终极配对：base(159) vs 明文(134) vs keys2(48) vs keys17 同会话（nsd=67402）
 * 检查 base = f(明文, keys) 的变换（逐段/逐块）
 */
const fs = require('fs');

(async () => {
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  const base = baseD.base, keys2 = baseD.keys2, keys17 = baseD.keys17;
  const plain = JSON.parse(fs.readFileSync('/tmp/nx_browser_plain_full.json', 'utf8')).arr;
  console.log('base len:', base.length, 'plain len:', plain.length);
  console.log('keys2 len:', keys2.length, 'keys17 len:', keys17.length);

  // 1. base[22:] vs 明文[24:] 长度
  console.log('base[22:] len:', base.length - 22, 'plain[24:] len:', plain.length - 24);

  // 2. base 结构：找段边界（参考 team-lead: [0-21]固定+[22-28]可变+[29-67]固定+[68+]随cd+尾10固定）
  console.log('\nbase[22-28]:', base.slice(22, 29).join(','));
  console.log('base[29-67]:', base.slice(29, 68).join(','));
  console.log('base[68-80]:', base.slice(68, 81).join(','));

  // 3. base[29-67]（跨 nsd 固定）与明文/keys 的关系
  console.log('\nbase[29-67]（固定段）:');
  console.log(base.slice(29, 68).join(','));

  // 4. 明文 vs b86 确认（标记位）
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

  // 5. 明文完整重建：b86[2:] + 标记位替换
  console.log('\n=== 明文重建 ===');
  const fb = b86.slice(2, 2 + plain.length);
  const diffs = [];
  for (let i = 0; i < plain.length; i++) if (plain[i] !== fb[i]) diffs.push(i);
  console.log('明文 vs b86[2:] 差异:', diffs.join(','));

  // 6. base[22:] 各段与明文段的关系
  console.log('\n=== base 段 vs 明文段 ===');
  // base[22-28] 7B（会话数据）——是否 = 明文某段？
  console.log('base[22-28]:', base.slice(22, 29).join(','));
  // base[29-67] 39B（跨 nsd 固定）——固定值
  console.log('base[29-67]:', base.slice(29, 68).join(','));

  // 7. base 与 keys2 的 XOR（各段）
  console.log('\nbase[22:70]^keys2:');
  const xk = [];
  for (let i = 0; i < 48; i++) xk.push((base[22 + i] ^ keys2[i]) & 0xff);
  console.log(xk.join(','));

  // 8. 明文[24:72]^keys2
  console.log('plain[24:72]^keys2:');
  const xp = [];
  for (let i = 0; i < 48; i++) xp.push((plain[24 + i] ^ keys2[i]) & 0xff);
  console.log(xp.join(','));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
