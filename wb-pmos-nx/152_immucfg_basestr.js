/**
 * 152_immucfg_basestr.js
 *
 * 从 nx 外层 JS 提取 immucfg（4 个最长字符串），检查 cp0/cp2 是否含 basestr
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
  console.log('immucfg keys:', Object.keys(immucfg));
  for (const [k, v] of Object.entries(immucfg)) {
    if (typeof v === 'string') {
      console.log(k, 'len=', v.length, '前 30:', JSON.stringify(v.substring(0, 30)));
      // 检查是否含 - 或 base64 风格
      const hasDash = v.includes('-');
      const chars = [...new Set(v.split(''))];
      console.log('  唯一字符数:', chars.length, '含-:', hasDash, '含.:', v.includes('.'));
    } else if (Array.isArray(v)) {
      console.log(k, 'len=', v.length, '前 10:', v.slice(0, 10));
    } else {
      console.log(k, typeof v, String(v).substring(0, 40));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
