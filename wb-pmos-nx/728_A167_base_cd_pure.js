/**
 * 728_A167_base_cd_pure.js
 * 验证 base 是否 = f(cd) 纯函数（同 cd 两次 → 同 base？）
 * 746 已有 3 会话数据（不同 cd → 不同 base）
 * 检查 base 与 cd/b86 的相关性 + 固定段确认
 */
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;

  console.log('=== base 固定段（跨 cd）===');
  // 逐字节对比 3 会话 base
  const b0 = sessions[0].base;
  for (let i = 0; i < 30; i++) {
    const vals = sessions.map(s => s.base[i]);
    if (new Set(vals).size === 1) console.log(`base[${i}] = ${vals[0]} (跨 cd 恒定)`);
  }

  console.log('\n=== base 尾部固定段 ===');
  const tailLen = 10;
  const tails = sessions.map(s => s.base.slice(-tailLen).join(','));
  console.log(tails.join('\n'));

  console.log('\n=== base 可变段（22+）是否 = f(cd) ===');
  // 同 cd 重复测试需要新采集，这里用现有数据检查长度
  for (const s of sessions) {
    console.log(`nsd=${s.nsd}: base[22:] len=${s.base.length - 22} 值域 min=${Math.min(...s.base.slice(22))} max=${Math.max(...s.base.slice(22))}`);
  }

  console.log('\n=== keys2 与 base 关系 ===');
  for (const s of sessions) {
    const x = [];
    for (let i = 0; i < 16; i++) x.push((s.base[i] ^ s.keys2[i]) & 0xff);
    console.log(`nsd=${s.nsd}: base[0:16]^keys2[0:16]: ${x.join(',')}`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
