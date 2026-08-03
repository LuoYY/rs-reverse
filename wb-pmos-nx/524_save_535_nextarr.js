/**
 * 524_save_535_nextarr.js
 * 采集真实加载的 535 cookie → 保存 nextarr 详细结构 → 对比 343（route.fulfill）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

(async () => {
  const { NxClient, parseProxy } = require(path.join(__dirname, 'nx_pure_client'));
  const proxyStr = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
  const c = await NxClient.create({ proxy: proxyStr, proxyObj: parseProxy(proxyStr) });
  console.log('nextarr len:', c.nextarr.length, 'keys2:', c.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  // 保存 nextarr（含 uuid）
  fs.writeFileSync('/tmp/nextarr535.json', JSON.stringify(c.nextarr));
  const na = c.nextarr.slice(4);
  console.log('nextarr(无uuid) len:', na.length);
  console.log('na[0-11]:', na.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
  const beLen = na[60];
  console.log('beLen:', beLen, 'be 实际:', na.length - 61);
  console.log('na[59]:', na[59].toString(16), 'na[60]:', na[60].toString(16));
  console.log('keys2 匹配 na[11-58]:', JSON.stringify(c.keys2) === JSON.stringify(na.slice(11, 59)));
  // r2mka/start
  console.log('r2mka:', na.slice(2, 6).map(b => b.toString(16).padStart(2, '0')).join(' '), 'start:', na.slice(6, 10).map(b => b.toString(16).padStart(2, '0')).join(' '));
  // 对比 343
  const na343 = JSON.parse(fs.readFileSync('/tmp/naA.json', 'utf8'));
  console.log('\n=== 343 vs 535 ===');
  console.log('343 len:', na343.length, '535 len:', na.length);
  console.log('343 na[0-11]:', na343.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('343 beLen:', na343[60], 'be 实际:', na343.length - 61);
  await c.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
