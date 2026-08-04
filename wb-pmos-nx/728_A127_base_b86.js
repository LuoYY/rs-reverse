/**
 * 728_A127_base_b86.js
 * 多会话 base 与 b86 深层关系：base[22+] 是否 = b86 某段的变换
 * base len 166-163, b86 len 1731-1744
 */
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;

  // 1. base[16+] 在 b86 中的滑动匹配
  console.log('=== base[22:60] 在 b86 中滑动匹配（跨会话）===');
  for (const s of sessions) {
    let best = { off: -1, m: 0 };
    for (let off = 0; off < s.b86.length - 38; off++) {
      let m = 0;
      for (let i = 0; i < 38; i++) if (s.b86[off + i] === s.base[22 + i]) m++;
      if (m > best.m) best = { off, m };
    }
    console.log(`nsd=${s.nsd}: best off=${best.off} 匹配 ${best.m}/38`);
    if (best.m > 10) {
      console.log(`  b86[${best.off}:${best.off + 38}]: ${s.b86.slice(best.off, best.off + 38).join(',')}`);
      console.log(`  base[22:60]:       ${s.base.slice(22, 60).join(',')}`);
    }
  }

  // 2. base 长度与 b86 长度的关系
  console.log('\n=== 长度关系 ===');
  for (const s of sessions) {
    console.log(`nsd=${s.nsd}: base=${s.base.length} b86=${s.b86.length} keys2=${s.keys2.length}`);
  }

  // 3. base[22:] 值域分析
  console.log('\n=== base[22:] 值域 ===');
  for (const s of sessions) {
    const seg = s.base.slice(22);
    const min = Math.min(...seg), max = Math.max(...seg);
    const avg = seg.reduce((a, b) => a + b, 0) / seg.length;
    console.log(`nsd=${s.nsd}: base[22:] min=${min} max=${max} avg=${avg.toFixed(1)}`);
    // 0x30-0x3C 比例（明文 basearr 特征）
    const ascii = seg.filter(b => b >= 0x30 && b <= 0x3c).length;
    console.log(`  0x30-0x3C 字符: ${ascii}/${seg.length} (${(ascii / seg.length * 100).toFixed(0)}%)`);
  }

  // 4. base[16:22] 固定段 vs b86
  console.log('\n=== base[16:22] 固定段 ===');
  for (const s of sessions) console.log(`nsd=${s.nsd}: base[16:22]=${s.base.slice(16, 22).join(',')}`);

  // 5. base[0:16] 固定段
  console.log('\n=== base[0:16] 固定段 ===');
  for (const s of sessions) console.log(`nsd=${s.nsd}: base[0:16]=${s.base.slice(0, 16).join(',')}`);

  // 6. base[22:] 与 keys2 的交叉对比（3 会话）
  console.log('\n=== base[22:70] vs keys2[0:48] XOR（3 会话）===');
  for (const s of sessions) {
    const xk = [];
    for (let i = 0; i < 48; i++) xk.push(s.base[22 + i] ^ s.keys2[i]);
    console.log(`nsd=${s.nsd}: base[22:70]^keys2: ${xk.join(',')}`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
