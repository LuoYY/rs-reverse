/**
 * 728_A189_base_structure_mark.js
 * 分析 base 结构合法性：varint 长度头/段标记
 * 参考 team-lead：置 0 破坏内部结构 → 412；49-56/89-96 置 0 → 400
 */
const fs = require('fs');

(async () => {
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  const base = baseD.base;
  console.log('base len:', base.length);
  console.log('完整 base:', base.join(','));

  // 1. varint 长度头分析：base[0] 或 base[22] 是否长度字段
  console.log('\n=== base[0-5] 固定头 ===');
  console.log('base[0-5]:', base.slice(0, 6).join(','));

  // 2. base[22-28] 会话数据（7B）——是否 varint + 长度？
  console.log('\nbase[22-28]:', base.slice(22, 29).join(','));
  // 尝试解释为 varint
  console.log('base[22]=', base[22], '(0x' + base[22].toString(16) + ')', base[22] < 128 ? 'varint 1字节长度=' + base[22] : 'varint 多字节');

  // 3. 段标记：0 值位置
  console.log('\n=== base 中 0 值位置 ===');
  const zeros = [];
  for (let i = 0; i < base.length; i++) if (base[i] === 0) zeros.push(i);
  console.log('0 值位置:', zeros.join(','));
  console.log('0 值数:', zeros.length);

  // 4. 255 值位置
  console.log('\n=== base 中 255 值位置 ===');
  const ff = [];
  for (let i = 0; i < base.length; i++) if (base[i] === 255) ff.push(i);
  console.log('255 值位置:', ff.join(','));

  // 5. 段分析：base 被 0 分隔的段
  console.log('\n=== base 分段（0 分隔）===');
  let segStart = 0;
  for (let i = 0; i <= base.length; i++) {
    if (i === base.length || base[i] === 0) {
      if (i > segStart) {
        const seg = base.slice(segStart, i);
        console.log(`段 [${segStart}-${i - 1}] (len ${seg.length}): ${seg.join(',')}`);
      }
      segStart = i + 1;
    }
  }

  // 6. team-lead 提到 49-56 和 89-96 置 0 → 400（过了 cookie 层）
  // 分析这些位置
  console.log('\n=== team-lead 敏感位置 ===');
  console.log('base[49-56]:', base.slice(49, 57).join(','));
  console.log('base[89-96]:', base.slice(89, 97).join(','));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
