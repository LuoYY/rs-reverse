/**
 * 728_A156_base_b86_segments.js
 * 3 会话：base[22:] 与 b86 的逐 16 字节块关系
 * 检查 base 是否 = b86 特定段（16 字节块级的变换/重排）
 */
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;

  // 1. base 每 16 字节块 vs b86 每 16 字节块（滑动匹配）
  console.log('=== base 16 字节块在 b86 中匹配 ===');
  for (const s of sessions) {
    console.log(`\nnsd=${s.nsd}: base len=${s.base.length}`);
    // base 每个 16 字节块在 b86 中搜索
    for (let bi = 0; bi < s.base.length; bi += 16) {
      const block = s.base.slice(bi, bi + 16);
      let found = -1;
      for (let off = 0; off <= s.b86.length - 16; off++) {
        let m = 0;
        for (let i = 0; i < 16; i++) if (s.b86[off + i] === block[i]) m++;
        if (m >= 14) { found = off; break; }
      }
      console.log(`  base[${bi}:${bi + 16}] ${found >= 0 ? '≈ b86[' + found + '] 匹配14+' : '无匹配'} (${block.slice(0, 8).join(',')})`);
    }
  }

  // 2. base 长度 vs b86 关系
  console.log('\n=== base 长度 vs b86 长度 ===');
  for (const s of sessions) {
    console.log(`nsd=${s.nsd}: base=${s.base.length} b86=${s.b86.length} base/b86=${(s.base.length / s.b86.length * 100).toFixed(1)}%`);
  }

  // 3. base 是否 = b86[0:base.len] XOR 固定流（跨会话验证）
  console.log('\n=== base[i] ^ b86[i] 跨会话 ===');
  const b0 = sessions[0].base, b86_0 = sessions[0].b86;
  for (let i = 0; i < 30; i++) {
    const v0 = b0[i] ^ b86_0[i];
    const vals = [v0];
    for (let si = 1; si < sessions.length; si++) {
      vals.push(sessions[si].base[i] ^ sessions[si].b86[i]);
    }
    if (new Set(vals).size === 1) console.log(`base[${i}]^b86[${i}] = ${v0} (跨会话恒定)`);
  }

  // 4. base[i] ^ b86[i+2] 跨会话
  console.log('\n=== base[i] ^ b86[i+2] 跨会话（对齐明文偏移）===');
  for (let i = 0; i < 30; i++) {
    const vals = [];
    for (let si = 0; si < sessions.length; si++) {
      vals.push(sessions[si].base[i] ^ sessions[si].b86[i + 2]);
    }
    if (new Set(vals).size === 1) console.log(`base[${i}]^b86[${i + 2}] = ${vals[0]} (跨会话恒定)`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
