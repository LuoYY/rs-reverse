/**
 * 728_A197_fixed_vary_sub.js
 * 精确定位 base[68:92] 和 base[92:116] 的固定/可变子结构（跨 4 会话）
 */
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  const all = [...sessions.map(s => ({ name: 'nsd' + s.nsd, base: s.base })), { name: '67402', base: baseD.base }];

  // 逐位置固定性（base[68:116]）
  console.log('=== base[68:116] 逐位置固定性（跨 4 会话）===');
  const maxLen = Math.max(...all.map(s => s.base.length));
  for (let i = 68; i < Math.min(maxLen, 116); i++) {
    const vals = all.map(s => s.base[i]);
    const uniq = [...new Set(vals)];
    console.log(`base[${i}]: ${uniq.length === 1 ? '固定=' + vals[0] : '可变 ' + uniq.join(',')}`);
  }

  // base[68:92] 中与 nsd107586 共享的尾部
  console.log('\n=== base[68:92] 尾部共同段 ===');
  const s107 = all.find(s => s.name === 'nsd107586').base.slice(68, 92);
  const s674 = all.find(s => s.name === '67402').base.slice(68, 92);
  for (let i = 0; i < 24; i++) {
    if (s107[i] === s674[i]) console.log(`偏移 ${68 + i}: 107586=${s107[i]} 67402=${s674[i]} 相同`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
