/**
 * 748_base_structure.js
 * 离线分析 base(168) 结构：
 * 1. 明文 basearr == b86[2:2+len]？(167 长度验证)
 * 2. base[16+] 与明文 basearr[16+]/b86 关系
 * 3. base 前 16 固定块性质
 * 4. base[25-28] 来源
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
  const d = JSON.parse(fs.readFileSync('/tmp/nx_747_data.json', 'utf8'));
  const cap = d.cap, base = d.base, b86 = d.b86, cd = d.cd;

  console.log('cap(明文) len:', cap.length, 'base len:', base.length, 'b86 len:', b86.length);

  // 1. 明文 == b86[2:2+cap.len]?
  const fb = b86.slice(2, 2 + cap.length);
  const diffs1 = [];
  for (let i = 0; i < cap.length; i++) if (fb[i] !== cap[i]) diffs1.push(i);
  console.log('\n明文 vs b86[2:]: 差异', diffs1.length, diffs1.length ? '前20: ' + diffs1.slice(0, 20).join(',') : '★★★ 完全一致！明文 = b86[2:2+len]');

  // 2. base vs b86 全匹配（偏移搜索）
  console.log('\nbase 在 b86 中查找（各偏移）:');
  for (let off = 0; off <= 20; off++) {
    let match = 0;
    for (let i = 0; i < Math.min(30, base.length); i++) {
      if (b86[off + i] === base[i]) match++;
    }
    if (match > 10) console.log(`  off=${off}: 前30匹配${match}个`);
  }

  // 3. base 完整打印
  console.log('\nbase 完整:', base.join(','));
  console.log('\nbase[16-40]:', base.slice(16, 41).join(','));
  console.log('cap[16-40]:', cap.slice(16, 41).join(','));
  console.log('b86[18-42]:', b86.slice(18, 43).join(','));

  // 4. base 逐段结构分析
  console.log('\n=== base 结构 ===');
  console.log('base[0-15]（固定）:', base.slice(0, 16).join(','));
  console.log('base[16-31]:', base.slice(16, 32).join(','));
  console.log('base[32-47]:', base.slice(32, 48).join(','));
  console.log('base[48-63]:', base.slice(48, 64).join(','));

  // 5. base 值域/可读性
  const chars = base.map(c => (c >= 32 && c <= 126) ? String.fromCharCode(c) : (c === 0 ? '·' : '#')).join('');
  console.log('\nbase 字符形式:', chars.substring(0, 100));

  // 6. base[25-28]
  console.log('\nbase[25-28]:', base.slice(25, 29).join(','));
  console.log('cap[25-28]:', cap.slice(25, 29).join(','));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
