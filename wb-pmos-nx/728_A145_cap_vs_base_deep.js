/**
 * 728_A145_cap_vs_base_deep.js
 * 747 数据（同会话）：cap 明文（167B, 113开头） vs base（168B, 179开头）
 * 深入对比：base 是否 = cap 的重组/变换（非加密函数）
 * 检查：位置重排 / 差值 / 分段 / 字节对调
 */
const fs = require('fs');

(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_747_data.json', 'utf8'));
  const cap = d.cap, base = d.base, b86 = d.b86, keys2 = d.keys2;
  console.log('cap len:', cap.length, 'base len:', base.length);

  // 1. base 是否 = cap 的某种重排（找 base[0] 179 在 cap 中的位置）
  console.log('\n=== base 元素在 cap 中的位置 ===');
  for (let i = 0; i < Math.min(10, base.length); i++) {
    const pos = [];
    for (let j = 0; j < cap.length; j++) if (cap[j] === base[i]) pos.push(j);
    console.log(`base[${i}]=${base[i]}: cap 位置 ${pos.slice(0, 10).join(',')}`);
  }

  // 2. base[22:] 与 cap[24:] 逐字节对比（长度差 146 vs 143）
  console.log('\n=== base[22:] vs cap[24:] ===');
  const bl = base.slice(22), cl = cap.slice(24);
  console.log('base[22:]:', bl.slice(0, 30).join(','));
  console.log('cap[24:]:', cl.slice(0, 30).join(','));
  // 差值
  const diff = [];
  for (let i = 0; i < Math.min(bl.length, cl.length); i++) diff.push((bl[i] - cl[i] + 256) % 256);
  console.log('差值 mod 256:', diff.slice(0, 30).join(','));

  // 3. base 是否 = cap 的字节交换（奇偶位）
  console.log('\n=== base 与 cap 奇偶/分段 ===');
  // cap 每 16 字节有标记位（24,40,...），base 对应？
  const capMarks = []; for (let i = 0; i < cap.length; i += 16) capMarks.push(cap[i]);
  const baseMarks = []; for (let i = 0; i < base.length; i += 16) baseMarks.push(base[i]);
  console.log('cap 每16字节:', capMarks.join(','));
  console.log('base 每16字节:', baseMarks.join(','));

  // 4. 明文 basearr 的 16 字节块结构
  console.log('\n=== cap 16 字节块 ===');
  for (let i = 0; i < cap.length; i += 16) {
    const block = cap.slice(i, i + 16);
    console.log(`cap[${i}:${i + 16}]: ${block.join(',')}`);
  }
  console.log('\n=== base 16 字节块 ===');
  for (let i = 0; i < base.length; i += 16) {
    const block = base.slice(i, i + 16);
    console.log(`base[${i}:${i + 16}]: ${block.join(',')}`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
