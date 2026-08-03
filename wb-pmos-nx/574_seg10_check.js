/**
 * 574_seg10_check.js
 * 验证 nx basearr [24-29] = xb seg10 公式（time4 + keys19）
 * xb seg10 = [flagcheck, 13, time4(4B), keys19_4(4B), random8(8B), flag]
 * nx [24-29] 6 字节动态 → 可能是 time4(4B)+其他 2B 或 keys19 相关
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 2; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  const k19n = +k[19].map(c => String.fromCharCode(c)).join('');
  const k21 = +k[21].map(c => String.fromCharCode(c)).join('');
  const flag = +k[24].map(c => String.fromCharCode(c)).join('');
  console.log(`\nS${i + 1}:`);
  console.log('[24-29]:', b.slice(24, 30).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('  [24-27] 大端:', b.slice(24, 28).reduce((a, x) => a * 256 + x, 0), 'hex:', b.slice(24, 28).map(x => x.toString(16).padStart(2, '0')).join(''));
  console.log('  [25-28] 大端:', b.slice(25, 29).reduce((a, x) => a * 256 + x, 0));
  console.log('  [26-29] 大端:', b.slice(26, 30).reduce((a, x) => a * 256 + x, 0));
  console.log('  keys19 数字:', k19n, 'hex:', k19n.toString(16));
  console.log('  keys21(r2mkaTime):', k21, 'hex:', k21.toString(16));
  console.log('  flag:', flag);
  // keys19 数字小端/大端编码
  console.log('  keys19 大端4B:', [(k19n >>> 24) & 255, (k19n >>> 16) & 255, (k19n >>> 8) & 255, k19n & 255].map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('  keys19 小端4B:', [k19n & 255, (k19n >>> 8) & 255, (k19n >>> 16) & 255, (k19n >>> 24) & 255].map(x => x.toString(16).padStart(2, '0')).join(' '));
  // 时间（r2mkaTime）大端
  console.log('  r2mkaTime 大端4B:', [(k21 >>> 24) & 255, (k21 >>> 16) & 255, (k21 >>> 8) & 255, k21 & 255].map(x => x.toString(16).padStart(2, '0')).join(' '));
  // 当前 unix
  console.log('  当前unix:', Math.floor(Date.now() / 1000), 'hex:', Math.floor(Date.now() / 1000).toString(16));
}
