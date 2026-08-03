/**
 * 614_random8_find.js
 * 验证 nx basearr 中是否存在 random8 字段：
 * random8 = Math.floor(random*1048575)*2^32 + (currentTime & 0xFFFFFFFF)
 * 用 3 会话数据，检查 [25-28]（12151 小值）是否 = random*1048575
 * 或 [84-91] 等位置是否 = currentTime
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 3; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  const k21 = +k[21].map(c => String.fromCharCode(c)).join('');
  console.log(`\n=== S${i + 1} r2mkaTime=${k21} ===`);
  console.log('basearr len:', b.length);

  // 所有 4 字节窗口的 BE 值，找 < 1048575 的（random*1048575 候选）
  console.log('小值窗口（<1048575）:');
  for (let j = 20; j < b.length - 4; j++) {
    const v = b.slice(j, j + 4).reduce((a, x) => a * 256 + x, 0);
    if (v < 1048575 && v > 100) console.log(`  [${j}-${j + 3}] BE=${v} hex=${b.slice(j, j + 4).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  }

  // 找 currentTime 低 32 位（≈ k21）的 4 字节窗口（LE 或 BE）
  const k21low = k21 & 0xFFFFFFFF;
  console.log('currentTime 低32 =', k21low, 'hex:', (k21low >>> 0).toString(16));
  for (let j = 20; j < b.length - 4; j++) {
    const be = b.slice(j, j + 4).reduce((a, x) => a * 256 + x, 0) >>> 0;
    const le = b.slice(j, j + 4).reduce((a, x, t) => a + (x << (8 * t)), 0) >>> 0;
    if (be === k21low || le === k21low) console.log(`  ★ [${j}-${j + 3}] 匹配 currentTime (BE=${be.toString(16)} LE=${le.toString(16)})`);
  }

  // [25-28] 具体值
  console.log('[25-28]:', b.slice(25, 29).map(x => x.toString(16).padStart(2, '0')).join(' '), 'BE:', b.slice(25, 29).reduce((a, x) => a * 256 + x, 0));
}
process.exit(0);
