/**
 * 728_A196_6892_multi.js
 * 3 会话 base[68:92] 对比：值域/长度/模式
 */
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));

  const all = [...sessions.map(s => ({ name: 'nsd' + s.nsd, base: s.base })), { name: '67402', base: baseD.base }];
  for (const s of all) {
    const seg = s.base.slice(68, 92);
    console.log(`${s.name}: len=${s.base.length} base[68:92]=${seg.join(',')}`);
    console.log(`  base[92:116]=${s.base.slice(92, 116).join(',')}`);
  }

  // 值域分析
  console.log('\n=== base[68:92] 值域 ===');
  for (const s of all) {
    const seg = s.base.slice(68, 92);
    console.log(`${s.name}: 值域=[${[...new Set(seg)].sort((a, b) => a - b).join(',')}]`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
