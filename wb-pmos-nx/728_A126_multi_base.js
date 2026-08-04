/**
 * 728_A126_multi_base.js
 * 多会话 base 分析：base[22+] 可变段与 cap/keys2/b86 的关系
 */
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;
  console.log('会话数:', sessions.length);
  for (const s of sessions) {
    console.log(`nsd=${s.nsd}: base len=${s.base.length} cap len=${s.cap ? s.cap.length : '?'} keys2 len=${s.keys2 ? s.keys2.length : '?'}`);
  }

  // base[22+] 跨会话结构：固定段 vs 可变段
  console.log('\n=== base[22+] 跨会话 ===');
  const s0 = sessions[0].base;
  for (let i = 1; i < sessions.length; i++) {
    const si = sessions[i].base;
    const diffs = [];
    for (let j = 22; j < Math.min(s0.length, si.length); j++) if (s0[j] !== si[j]) diffs.push(j);
    console.log(`会话0 vs ${i}: base[22+] 差异 ${diffs.length}/${Math.min(s0.length, si.length) - 22}`);
    console.log(`  前 30 差异位置: ${diffs.slice(0, 30).join(',')}`);
    // 相同位置
    const same = [];
    for (let j = 22; j < Math.min(s0.length, si.length); j++) if (s0[j] === si[j]) same.push(j);
    console.log(`  相同位置: ${same.join(',')}`);
  }

  // base 长度与 cap 长度关系
  console.log('\n=== base 长度 vs cap 长度 ===');
  for (const s of sessions) {
    if (s.cap) console.log(`nsd=${s.nsd}: base=${s.base.length} cap=${s.cap.length} b86=${s.b86.length}`);
  }

  // base 尾部跨会话
  console.log('\n=== base 尾部 8 跨会话 ===');
  for (const s of sessions) console.log(`nsd=${s.nsd}: 尾8=${s.base.slice(-8).join(',')}`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
