/**
 * 750_base16_analysis.js
 * 分析 base[16+] 与 b86[2:]（明文 basearr）/keys 的关系（3 会话）
 * 寻找 base 的生成公式
 */
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;
  console.log('会话数:', sessions.length);

  // 1. base 前 16 固定确认
  console.log('\n=== base[0-15] 跨会话 ===');
  for (const s of sessions) console.log(`nsd=${s.nsd}: ${s.base.slice(0, 16).join(',')}`);

  // 2. base[16+] vs b86[2+16:]
  console.log('\n=== base[16-40] vs b86[18-42]（明文近似）===');
  for (const s of sessions) {
    console.log(`nsd=${s.nsd}:`);
    console.log(`  base[16-40]: ${s.base.slice(16, 41).join(',')}`);
    console.log(`  b86[18-42]: ${s.b86.slice(18, 43).join(',')}`);
    // XOR
    const xor = [];
    for (let i = 0; i < Math.min(25, s.base.length - 16); i++) xor.push(s.base[16 + i] ^ s.b86[18 + i]);
    console.log(`  XOR: ${xor.join(',')}`);
  }

  // 3. base[16+] 与 keys2 的关系
  console.log('\n=== base vs keys2 ===');
  for (const s of sessions) {
    console.log(`nsd=${s.nsd}: keys2[0-15]=${s.keys2.slice(0, 16).join(',')}`);
    console.log(`  base[16-31]=${s.base.slice(16, 32).join(',')}`);
    const xor = [];
    for (let i = 0; i < 16; i++) xor.push(s.base[16 + i] ^ s.keys2[i]);
    console.log(`  base[16:32]^keys2[0:16]: ${xor.join(',')}`);
  }

  // 4. base 尾部分析（长度差：166/163 vs 明文 167）
  console.log('\n=== base 尾部 ===');
  for (const s of sessions) {
    console.log(`nsd=${s.nsd}: base len=${s.base.length} 尾10=${s.base.slice(-10).join(',')} b86尾10=${s.b86.slice(-10).join(',')}`);
  }

  // 5. base[16+] 是否跨会话有公共模式（非 cd 部分）
  console.log('\n=== base[16+] 跨会话对比 ===');
  const b0 = sessions[0].base;
  for (let i = 1; i < sessions.length; i++) {
    const b1 = sessions[i].base;
    const diffs = [];
    for (let j = 16; j < Math.min(b0.length, b1.length); j++) if (b0[j] !== b1[j]) diffs.push(j);
    console.log(`会话0 vs ${i}: base[16+] 差异 ${diffs.length}/${Math.min(b0.length, b1.length) - 16} 处`);
    // 相同位置
    const same = [];
    for (let j = 16; j < Math.min(b0.length, b1.length); j++) if (b0[j] === b1[j]) same.push(j);
    console.log(`  相同位置: ${same.join(',')}`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
