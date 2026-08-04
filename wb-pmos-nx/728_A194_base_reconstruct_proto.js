/**
 * 728_A194_base_reconstruct_proto.js
 * base 结构重建原型：固定头 + 段结构 + 数据段
 * 验证"结构重建"方案（绕过 VM）
 *
 * base 结构（实测）：
 * [0-21] 固定头（跨 nsd 恒定）
 * [22:]  段结构（0 分隔）+ 数据段（服务器校验核心数据）
 *
 * 重建策略：
 * 1. 固定头直接硬编码
 * 2. 段结构：从真实 base 样本提取（段边界模式）
 * 3. 数据段：先用真实值（验证结构），后续研究推导
 */
const fs = require('fs');

(async () => {
  // 真实 base 样本（nsd=67402 或 746 会话）
  const samples = [];
  try {
    const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
    samples.push({ name: '67402', base: baseD.base });
  } catch (e) {}
  try {
    const d = JSON.parse(fs.readFileSync('/tmp/nx_746_sessions.json', 'utf8'));
    for (const s of d.sessions) samples.push({ name: 'nsd' + s.nsd, base: s.base });
  } catch (e) {}

  console.log('base 样本数:', samples.length);
  for (const s of samples) {
    console.log(`${s.name}: len=${s.base.length} 固定头[0-21]=${s.base.slice(0, 22).join(',')}`);
  }

  // 1. 固定头提取
  const fixedHead = samples[0].base.slice(0, 22);
  console.log('\n固定头（可硬编码）:', fixedHead.join(','));

  // 2. 段结构分析
  console.log('\n段结构（0 分隔）:');
  for (const s of samples) {
    const segs = [];
    let segStart = 0;
    for (let i = 0; i <= s.base.length; i++) {
      if (i === s.base.length || s.base[i] === 0) {
        if (i > segStart) segs.push(s.base.slice(segStart, i).length);
        segStart = i + 1;
      }
    }
    console.log(`${s.name}: 段长序列=[${segs.join(',')}] 段数=${segs.length}`);
  }

  // 3. 数据段统计
  console.log('\n数据段（固定头之后）:');
  for (const s of samples) {
    const data = s.base.slice(22);
    const segs = data.join(',').split(',0,').map(x => x.split(',').length);
    console.log(`${s.name}: [22:] len=${data.length} 子段长=[${segs.join(',')}]`);
  }

  // 4. 结构重建原型（用真实样本的段结构 + 固定头）
  console.log('\n=== 结构重建原型 ===');
  const proto = {
    fixedHead,
    structure: samples.map(s => ({ name: s.name, segments: (() => {
      const segs = [];
      let segStart = 22;
      for (let i = 22; i <= s.base.length; i++) {
        if (i === s.base.length || s.base[i] === 0) {
          if (i > segStart) segs.push(s.base.slice(segStart, i));
          segStart = i + 1;
        }
      }
      return segs;
    })() }))
  };
  fs.writeFileSync('/tmp/nx_base_structure.json', JSON.stringify(proto, null, 1));
  console.log('已保存 /tmp/nx_base_structure.json（结构重建基础）');

  // 5. 重建测试：固定头 + 真实段（验证结构正确性）
  console.log('\n=== 重建验证 ===');
  const s0 = proto.structure[0];
  const rebuilt = [...proto.fixedHead];
  for (let i = 0; i < s0.segments.length; i++) {
    if (i > 0) rebuilt.push(0);
    rebuilt.push(...s0.segments[i]);
  }
  console.log('重建 len:', rebuilt.length, '原始 len:', samples[0].base.length);
  const match = rebuilt.every((v, i) => v === samples[0].base[i]);
  console.log('重建与原 base 一致:', match);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
