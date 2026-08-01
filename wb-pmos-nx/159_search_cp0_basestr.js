/**
 * 159_search_cp0_basestr.js
 *
 * 搜索 cp0（immucfg）里的 64 字符 basestr 子串（含 - 不含 .）
 * 瑞数 basestr 可能藏在 cp0 的混淆文本中
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const outer = fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8');
  const getImmucfg = require('@utils/getImmucfg');
  const immucfg = getImmucfg(outer);
  const cp0 = immucfg.cp0;
  console.log('cp0 len:', cp0.length);

  // 找 64 个唯一字符的窗口（含 - 不含 .）
  const TARGET_CHARS = new Set('-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'.split(''));
  let best = 0, bestWin = '';
  for (let i = 0; i < cp0.length - 60; i++) {
    const win = cp0.substring(i, i + 64);
    // 检查窗口字符是否都是 TARGET_CHARS 的子集
    let inTarget = 0;
    for (const c of win) if (TARGET_CHARS.has(c)) inTarget++;
    if (inTarget > best) { best = inTarget; bestWin = win; }
    // 找 64 唯一字符（basestr 特征）
    const uniq = new Set(win.split(''));
    if (uniq.size >= 50 && uniq.has('-') && !uniq.has('.')) {
      console.log('候选 @' + i, 'uniq=' + uniq.size, JSON.stringify(win));
    }
  }
  console.log('\n最佳窗口:', best + '/64', JSON.stringify(bestWin));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
