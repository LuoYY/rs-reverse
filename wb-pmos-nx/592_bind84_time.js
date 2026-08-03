/**
 * 592_bind84_time.js
 * 分析 [84-87] 与时间戳/keys21/随机的关系
 * xb [10] 段 random8 = [Math.floor(random*1048575)*4294967296 + (currentTime&4294967295)>>>0] 8字节
 * 高4 = random*1048575 低4 = currentTime 低32
 * 检查 nx [84-87] 是否 = currentTime 或 random 组合
 */
const fs = require('fs');
const path = require('path');

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 3; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  const k21 = +k[21].map(c => String.fromCharCode(c)).join('');
  console.log(`\n=== S${i + 1} ===`);
  console.log('[84-87]:', b.slice(84, 88).map(x => x.toString(16).padStart(2, '0')).join(' '));
  const v = b.slice(84, 88).reduce((a, x) => a * 256 + x, 0);
  const vle = b.slice(84, 88).reduce((a, x, j) => a + (x << (8 * j)), 0) >>> 0;
  console.log('  BE:', v, 'LE:', vle);
  console.log('  keys21(r2mkaTime):', k21, 'hex:', k21.toString(16));
  console.log('  BE - keys21:', v - k21);
  console.log('  LE - keys21:', vle - k21);
  // xb random8 低4 = currentTime & 0xFFFFFFFF
  // currentTime = 采集时刻（约 = keys21 + 运行秒数）
  console.log('  keys21+60:', k21 + 60, 'hex:', (k21 + 60).toString(16));
  console.log('  keys21+120:', k21 + 120, 'hex:', (k21 + 120).toString(16));
  // 随机：xb random8 高4 = Math.floor(random*1048575) 约 0-1048574（小值）
  console.log('  高4字节[84-87] BE =', v, '→ 若高2字节小则像 random*1048575');

  // [24-29] 的 [25-28] 分析
  const v2528 = b.slice(25, 29).reduce((a, x) => a * 256 + x, 0);
  console.log('[25-28] BE:', v2528, 'hex:', b.slice(25, 29).map(x => x.toString(16).padStart(2, '0')).join(''));
  console.log('  [25-28] - keys21:', v2528 - k21);
  console.log('  [25-28] - keys19:', v2528 - +k[19].map(c => String.fromCharCode(c)).join(''));
}
process.exit(0);
