/**
 * 268_check_nextarr_keys2.js
 *
 * dump 浏览器 nextarr 结构，确认 keys2 实际值
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

(async () => {
  const nf = fs.readdirSync(OUT).filter(x => x.startsWith('browser_nextarr_')).sort().pop();
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, nf)));
  const nextarr = nd.nextarr;
  console.log('nextarr len:', nextarr.length);
  console.log('nextarr 前 70:', JSON.stringify(nextarr.slice(0, 70)));

  // 纯算法 keys2（修复）
  const kf = fs.readdirSync(OUT).filter(f => f.startsWith('keys_fixed_')).sort().pop();
  const keysData = JSON.parse(fs.readFileSync(path.join(OUT, kf)));
  const pureK2 = keysData.keys[2];
  console.log('\n纯算法 keys2:', JSON.stringify(pureK2).substring(0, 80));

  // 检查 nextarr 中纯算法 keys2 的位置
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === pureK2[j])) {
      console.log('纯算法 keys2 前缀 @', i);
    }
  }

  // 检查 nextarr[11..58] 是否 48B 且含纯算法 keys2 任意位置
  const seg = nextarr.slice(11, 59);
  console.log('\nnextarr[11..58]:', JSON.stringify(seg).substring(0, 80));
  // 对比 pureK2
  let matchLen = 0;
  for (let i = 0; i < 48; i++) { if (seg[i] === pureK2[i]) matchLen++; }
  console.log('与纯算法 keys2 逐字节匹配数:', matchLen, '/48');
  for (let i = 0; i < 8; i++) console.log('  位置' + i + ': nextarr=' + seg[i] + ' pureK2=' + pureK2[i] + ' ' + (seg[i] === pureK2[i] ? '✓' : '✗'));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
