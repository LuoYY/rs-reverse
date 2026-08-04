/**
 * 728_A193_sensitive_positions.js
 * 分析 team-lead 敏感位置（49-56/89-96）在 base 段结构中的角色
 * 3 会话对比这些位置的值：固定/可变？
 */
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
  const sessions = data.sessions;

  // 敏感位置（相对 base）
  console.log('=== team-lead 敏感位置跨会话 ===');
  // 注意：746 base 与 /tmp/nx_final_base.json 不同 nsd，但位置敏感区域应类似
  for (const s of sessions) {
    const b = s.base;
    console.log(`nsd=${s.nsd}: base len=${b.length}`);
    console.log(`  [49-56]: ${b.slice(49, 57).join(',')}`);
    console.log(`  [89-96]: ${b.slice(89, 97).join(',')}`);
  }

  // 对比：这些位置是否跨会话固定
  const s0 = sessions[0].base;
  for (let i = 49; i <= 96; i++) {
    const vals = new Set(sessions.map(s => s.base[i]));
    if (vals.size === 1) console.log(`base[${i}]=${s0[i]} 固定`);
  }

  // 段结构中的敏感位置
  console.log('\n=== 段结构定位敏感位置 ===');
  for (const s of sessions) {
    const b = s.base;
    // 49-56 和 89-96 落在哪个段？
    for (const [name, range] of [['49-56', [49, 56]], ['89-96', [89, 96]]]) {
      // 找包含 range 的段
      let segStart = 0;
      for (let i = 0; i <= b.length; i++) {
        if (i === b.length || b[i] === 0) {
          if (range[0] >= segStart && range[1] <= i - 1) {
            console.log(`nsd=${s.nsd} ${name} → 段[${segStart}-${i - 1}] (len ${i - segStart})`);
          }
          segStart = i + 1;
        }
      }
    }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
