/**
 * 728_A125_base_origin.js
 * 探索 base(179) 的真正来源：
 * 1. base 是否 = b86 的某段（cd 解码）
 * 2. base 是否 = 明文 cap 经某种变换（非 huffman）
 * 3. base 是否 = 内层 VM 生成（与 dynCode/aebi 相关）
 * 4. base 结构：固定段/可变段拆分
 */
const fs = require('fs');
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
  const d = JSON.parse(fs.readFileSync('/tmp/nx_747_data.json', 'utf8'));
  const cap = d.cap, base = d.base, b86 = d.b86, keys2 = d.keys2;
  console.log('cap len:', cap.length, 'base len:', base.length, 'b86 len:', b86.length);

  // 1. base 在 b86 中查找（滑动窗口全匹配）
  console.log('\n=== base 在 b86 中的位置 ===');
  for (let off = 0; off < b86.length - base.length; off++) {
    let m = 0;
    for (let i = 0; i < base.length; i++) if (b86[off + i] === base[i]) m++;
    if (m >= base.length - 5) console.log(`  off=${off}: 匹配 ${m}/${base.length}`);
  }
  // base[16+] 在 b86 中
  console.log('base[16:] 在 b86 中查找:');
  for (let off = 0; off < b86.length - 20; off++) {
    let m = 0;
    for (let i = 0; i < 20; i++) if (b86[off + i] === base[16 + i]) m++;
    if (m >= 15) console.log(`  off=${off}: base[16:36] 匹配 ${m}/20`);
  }

  // 2. base vs cap 各段长度关系
  console.log('\n=== base 结构 ===');
  console.log('base[0-15]:', base.slice(0, 16).join(','));
  console.log('base[16-21]:', base.slice(16, 22).join(','));
  console.log('base[22-40]:', base.slice(22, 41).join(','));
  console.log('base 尾 10:', base.slice(-10).join(','));

  // 3. cap 每 16 字节标记位
  console.log('\n=== cap 标记位（每16字节）===');
  for (let i = 0; i < cap.length; i += 16) console.log(`  cap[${i}]=${cap[i]}`);
  // b86 标记位
  console.log('b86 对应位置:');
  for (let i = 0; i < cap.length; i += 16) console.log(`  b86[${i + 2}]=${b86[i + 2]}`);

  // 4. base[22+] 与 cap[24+] 的关系（同 cd，配对）
  console.log('\n=== base[22:] vs cap[24:] ===');
  const bl = base.length - 22, cl = cap.length - 24;
  console.log('base[22:] len:', bl, 'cap[24:] len:', cl);
  console.log('base[22-40]:', base.slice(22, 41).join(','));
  console.log('cap[24-42]:', cap.slice(24, 43).join(','));

  // 5. 检查 base 是否包含 keys 相关（session_data = keys[2] 48B）
  console.log('\n=== base[22:70] vs keys2 ===');
  console.log('base[22-69]:', base.slice(22, 70).join(','));
  console.log('keys2:', keys2.join(','));
  const xk = [];
  for (let i = 0; i < 48; i++) xk.push(base[22 + i] ^ keys2[i]);
  console.log('base[22:70]^keys2:', xk.join(','));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
