/**
 * 728_A170_final_pair.js
 * 最终配对分析：明文 basearr（130/150）与 base（158）同会话
 * base 长度 vs 明文长度；base 固定头尾 vs 明文；base 可变段 vs 明文可变段
 */
const fs = require('fs');

(async () => {
  // 同会话数据：A154 明文（134）+ A142 base（158）+ A160 明文（150）
  const plain134 = JSON.parse(fs.readFileSync('/tmp/nx_browser_plain_full.json', 'utf8'));
  const base158 = JSON.parse(fs.readFileSync('/tmp/nx_browser_base_full.json', 'utf8')).base;
  const prog = JSON.parse(fs.readFileSync('/tmp/nx_browser_programs.json', 'utf8'));
  const plain150 = prog.plain;

  console.log('明文(134) len:', plain134.len, 'base len:', base158.length);
  console.log('明文(134) head:', plain134.arr.slice(0, 16).join(','));
  console.log('base head:', base158.slice(0, 16).join(','));
  console.log('明文(150) head:', plain150.slice(0, 16).join(','));

  // base 长度 158 vs 明文 134/150：base = 明文 + 24/8 字节？
  console.log('\nbase - plain134 =', base158.length - plain134.len);
  console.log('base - plain150 =', base158.length - plain150.length);

  // base[22:]（136 字节）vs 明文[24:]（126/110 字节）
  // base 固定头 22 + 可变 136 + 固定尾? 158 = 22 + 136
  // 明文 150 = 固定头 24? + 可变 126
  console.log('\nbase 尾 10:', base158.slice(-10).join(','));
  console.log('明文(150) 尾 10:', plain150.slice(-10).join(','));

  // 检查 base[22:22+24] vs 明文[0:24]（base 是否以明文头开始？）
  console.log('\nbase[22:46] vs 明文[0:24]:');
  console.log('base[22:46]:', base158.slice(22, 46).join(','));
  console.log('plain150[0:24]:', plain150.slice(0, 24).join(','));
  // base[22] 附近是否有明文头（113,5,32,4）？
  for (let i = 0; i <= base158.length - 4; i++) {
    if (base158[i] === 113 && base158[i + 1] === 5) console.log('base 中找明文头 @', i);
  }
  // 明文值 0x30-0x3C 在 base 中的分布
  const plainVals = new Set(plain150);
  console.log('\n明文值域:', [...plainVals].sort((a, b) => a - b).join(','));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
