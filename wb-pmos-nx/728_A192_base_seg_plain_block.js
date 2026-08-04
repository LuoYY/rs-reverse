/**
 * 728_A192_base_seg_plain_block.js
 * base 段 vs 明文 16 字节块的关系（同会话）
 * 验证：base 段是否对应明文的 16 字节块（段数 vs 块数）
 */
const fs = require('fs');

function segments(base) {
  const segs = [];
  let segStart = 0;
  for (let i = 0; i <= base.length; i++) {
    if (i === base.length || base[i] === 0) {
      if (i > segStart) segs.push({ start: segStart, end: i - 1, data: base.slice(segStart, i) });
      segStart = i + 1;
    }
  }
  return segs;
}

(async () => {
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  const base = baseD.base;
  const plain = JSON.parse(fs.readFileSync('/tmp/nx_browser_plain_full.json', 'utf8')).arr;

  const segs = segments(base);
  console.log('base len:', base.length, '段数:', segs.length);
  console.log('明文 len:', plain.length);

  // 明文 16 字节块
  console.log('\n明文 16 字节块:', Math.ceil(plain.length / 16), '个');
  for (let i = 0; i < plain.length; i += 16) {
    console.log(`  块@${i}: ${plain.slice(i, i + 16).join(',')}`);
  }

  // base 段
  console.log('\nbase 段:');
  for (const s of segs) {
    console.log(`  段[${s.start}-${s.end}] (len ${s.data.length}): ${s.data.join(',')}`);
  }

  // 段数 vs 明文块数：段 20 vs 块 9？不匹配。但 base[0-21] 头 + 段...
  // base 数据部分（22+）= 137 字节。明文 24+ = 110 字节
  // 段数据总长（不含头）
  const segData = segs.filter(s => s.start >= 22).reduce((a, s) => a + s.data.length, 0);
  const segZeros = segs.filter(s => s.start >= 22).length - 1;
  console.log('\nbase[22:] 段数据总长:', segData, '分隔符:', segZeros, '合计:', segData + segZeros);
  console.log('明文[24:] 长:', plain.length - 24);

  // 关键：base 是否 = 明文加密后 + 0 分隔成段？
  // 或者段 = 明文块的加密？
  // base[22] 段1 长 7: [159,9,0,41,151,250] → 等等 159 是 varint 长度？
  console.log('\nbase[22]=159 若为长度... base[22:] 段1: [159,9] 后 0');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
