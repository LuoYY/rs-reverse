/**
 * 728_A168_base_var_analysis.js
 * base[22:] 可变段与明文 basearr 可变段（cap[24:]）的关系
 * 3 会话：base[22:] vs b86[24+2:]（明文近似）
 * 寻找 base[i] = f(b86[i]) 的一致变换
 */
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;

  // base[22:] vs b86[2+22:] 逐字节（明文 basearr ≈ b86[2:]，标记位除外）
  console.log('=== base[22:] vs b86[24:]（每字节 XOR）===');
  for (const s of sessions) {
    const x = [];
    for (let i = 0; i < Math.min(30, s.base.length - 22, s.b86.length - 24); i++) {
      x.push((s.base[22 + i] ^ s.b86[24 + i]) & 0xff);
    }
    console.log(`nsd=${s.nsd}: base[22:]^b86[24:]: ${x.join(',')}`);
  }

  // 跨会话：同一偏移的 XOR 是否一致（若一致说明 base[i]=b86[i]^const）
  console.log('\n=== 跨会话 XOR 一致性检查 ===');
  const s0 = sessions[0];
  for (let i = 0; i < 30; i++) {
    const vals = sessions.map(s => (s.base[22 + i] ^ s.b86[24 + i]) & 0xff);
    if (new Set(vals).size === 1) console.log(`偏移 ${22 + i}: XOR=${vals[0]} 恒定`);
  }

  // base 可变段 vs keys2 完整
  console.log('\n=== base[22:70] vs keys2[0:48] ===');
  for (const s of sessions) {
    const x = [];
    for (let i = 0; i < 48; i++) x.push((s.base[22 + i] ^ s.keys2[i]) & 0xff);
    console.log(`nsd=${s.nsd}: ${x.join(',')}`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
