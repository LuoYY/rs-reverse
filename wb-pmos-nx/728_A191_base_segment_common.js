/**
 * 728_A191_base_segment_common.js
 * 3 会话 base 的段结构共性分析：哪些段固定/可变
 * 验证"结构重建"可行性（固定段 + 随机可变段）
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
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;
  console.log('会话数:', sessions.length);

  // 逐段对比 3 会话
  console.log('\n=== 各会话段结构 ===');
  for (const s of sessions) {
    const segs = segments(s.base);
    console.log(`nsd=${s.nsd}: base len=${s.base.length} 段数=${segs.length} 段长=[${segs.map(x => x.data.length).join(',')}]`);
  }

  // 段对齐对比（位置 vs 内容）
  console.log('\n=== 逐位置固定性（跨 3 会话）===');
  const s0 = sessions[0].base;
  for (let i = 0; i < s0.length; i++) {
    const vals = new Set(sessions.map(s => s.base[i]));
    if (vals.size === 1) console.log(`base[${i}]=${s0[i]} 固定`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
