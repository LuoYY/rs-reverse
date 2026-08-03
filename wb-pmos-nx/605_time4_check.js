/**
 * 605_time4_check.js
 * 验证 nx basearr[25-28] 是否 = xb [10] 段 time4 公式：
 * time4 = r2mkaTime + runTime - startTime
 * （runTime = 当前时间戳，startTime = 页面加载时间戳，差值 = 运行秒数）
 * 需要知道采集时刻的 now 和页面加载时刻
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

// 数据集采集时记录的时间信息（nsd 对应 535 号采集时刻）
// S1/S2 的 keys21 差 2 秒 → 采集间隔 2 秒
// 需要知道每个会话的 startTime（页面加载时刻）
// 假设：keys21 = r2mkaTime（服务器下发的时间），startTime = 页面加载时间戳

for (let i = 0; i < 3; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  const k21 = +k[21].map(c => String.fromCharCode(c)).join('');
  console.log(`\nS${i + 1}: r2mkaTime=${k21}`);
  console.log('[24-29]:', b.slice(24, 30).map(x => x.toString(16).padStart(2, '0')).join(' '));
  const v25 = b.slice(25, 29).reduce((a, x) => a * 256 + x, 0);
  const v24 = b.slice(24, 28).reduce((a, x) => a * 256 + x, 0);
  const v26 = b.slice(26, 30).reduce((a, x) => a * 256 + x, 0);
  console.log('[24-27] BE:', v24, '[25-28] BE:', v25, '[26-29] BE:', v26);
  // time4 = k21 + (runTime - startTime)，runTime-startTime 应该是小值（0-几分钟）
  console.log('  [25-28]-k21:', v25 - k21, '(若为小值则 = time4)');
  console.log('  [24-27]-k21:', v24 - k21);
  console.log('  [26-29]-k21:', v26 - k21);
  // xb 的 random8 = Math.floor(random*1048575)*4294967296 + (currentTime & 0xFFFFFFFF)
  // 低 4 字节 = currentTime 低 32 位（unix 秒）
  console.log('  currentTime 低32:', (k21 + 120) & 0xFFFFFFFF, 'hex:', ((k21 + 120) & 0xFFFFFFFF).toString(16));
  // [84-87] 大端
  const v84 = b.slice(84, 88).reduce((a, x) => a * 256 + x, 0);
  console.log('[84-87] BE:', v84, 'hex:', b.slice(84, 88).map(x => x.toString(16).padStart(2, '0')).join(''));
  console.log('  [84-87]-k21:', v84 - k21);
  // [84-87] 小端
  const v84le = b.slice(84, 88).reduce((a, x, j) => a + (x << (8 * j)), 0) >>> 0;
  console.log('[84-87] LE:', v84le, 'hex:', (v84le).toString(16));
}
