/**
 * 751_base_xor_analysis.js
 * 分析 base[22+] 与明文 basearr（b86[2:]）的关系：
 * base[i] = 明文[i] ^ K?  base[i] = 明文[i] + K? base[i] = 明文[i] - K?
 * 跨会话 K 是否固定（若固定 → base = 明文 XOR/± K 公式）
 */
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;
  console.log('会话数:', sessions.length);

  // base vs 明文（b86[2:]）：计算 XOR/差/和，跨会话对比 K
  const minLen = Math.min(...sessions.map(s => Math.min(s.base.length - 22, s.b86.length - 24)));
  console.log('可对比长度(从22):', minLen);

  // XOR K
  console.log('\n=== base[22+] ^ b86[2+22:]（XOR 密钥跨会话）===');
  const xors = sessions.map(s => {
    const k = [];
    for (let i = 22; i < 22 + minLen; i++) k.push(s.base[i] ^ s.b86[i + 2]);
    return k;
  });
  // 跨会话比较
  let xorFixed = 0;
  for (let i = 0; i < minLen; i++) {
    const v0 = xors[0][i];
    if (xors.every(k => k[i] === v0)) xorFixed++;
  }
  console.log(`XOR 密钥跨会话固定位置: ${xorFixed}/${minLen}`);
  if (xorFixed > minLen * 0.5) {
    console.log('XOR K[0-31]:', xors[0].slice(0, 32).join(','));
  }

  // 差值
  console.log('\n=== base[22+] - b86[2+22:]（差值跨会话）===');
  const diffs = sessions.map(s => {
    const k = [];
    for (let i = 22; i < 22 + minLen; i++) k.push((s.base[i] - s.b86[i + 2] + 256) % 256);
    return k;
  });
  let diffFixed = 0;
  for (let i = 0; i < minLen; i++) {
    const v0 = diffs[0][i];
    if (diffs.every(k => k[i] === v0)) diffFixed++;
  }
  console.log(`差值跨会话固定: ${diffFixed}/${minLen}`);

  // base 内部重复模式（可能 LZ）
  console.log('\n=== base 结构模式 ===');
  const b0 = sessions[0].base;
  // base[16-21] 固定 = 211,238,166,172,241,181
  console.log('base[16-21]（固定）:', b0.slice(16, 22).join(','));
  console.log('base[22-31]:', b0.slice(22, 32).join(','));
  console.log('base[32-41]:', b0.slice(32, 42).join(','));

  // base 固定位置汇总（3 会话相同）
  console.log('\n=== base 固定位置（3 会话相同）===');
  const fixedPos = [];
  for (let i = 0; i < Math.min(...sessions.map(s => s.base.length)); i++) {
    if (sessions.every(s => s.base[i] === sessions[0].base[i])) fixedPos.push(i);
  }
  console.log('固定位置数:', fixedPos.length);
  console.log('固定位置:', fixedPos.join(','));
  console.log('固定值:', fixedPos.map(i => `${i}:${sessions[0].base[i]}`).join(' '));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
