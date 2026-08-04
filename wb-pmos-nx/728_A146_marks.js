/**
 * 728_A146_marks.js
 * 分析 cap（明文 basearr）与 b86[2:] 的 10 处标记位差异（24,40,56,...）
 * 理解明文 basearr 的构造规则
 */
const fs = require('fs');

(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_747_data.json', 'utf8'));
  const cap = d.cap, b86 = d.b86;
  console.log('cap len:', cap.length, 'b86 len:', b86.length);

  const fb = b86.slice(2, 2 + cap.length);
  const diffs = [];
  for (let i = 0; i < Math.min(fb.length, cap.length); i++) if (fb[i] !== cap[i]) diffs.push(i);
  console.log('差异位置:', diffs.join(','));

  console.log('\n=== 差异位置详情 ===');
  for (const i of diffs) {
    console.log(`cap[${i}]=${cap[i]} b86[${i + 2}]=${fb[i]} (cap 周围: ${cap.slice(i - 2, i + 3).join(',')})`);
  }

  // 每 16 字节块结构
  console.log('\n=== cap 16 字节块模式 ===');
  for (let i = 0; i < cap.length; i += 16) {
    const block = cap.slice(i, i + 16);
    console.log(`cap[${i}]: ${block.join(',')}`);
  }

  // 与 b86 对应块对比
  console.log('\n=== b86[2:] 16 字节块 ===');
  for (let i = 0; i < cap.length; i += 16) {
    const block = fb.slice(i, i + 16);
    console.log(`b86[${i + 2}]: ${block.join(',')}`);
  }

  // 分析块结构：看起来 cap[0]=113 固定, 每块 16 字节
  // 块模式: [A,B,C,D,32,57,X,56,14,Y,57,Z,52,5,57,W] ？
  console.log('\n=== cap 块共性分析 ===');
  // 提取每块固定位置
  for (let pos = 0; pos < 16; pos++) {
    const vals = [];
    for (let i = 0; i < cap.length; i += 16) if (i + pos < cap.length) vals.push(cap[i + pos]);
    const uniq = [...new Set(vals)];
    if (uniq.length <= 3) console.log(`位置 ${pos}: 值 ${uniq.join(',')} (跨块稳定)`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
