/**
 * 132_analyze_basearr_sample.js
 *
 * 分析 NX_BASEARR_SAMPLE（len243-nx）结构：长度/标头/会话相关段
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const len243nx = require('@src/handler/basearr/len243-nx');
  const gv = require('@src/handler/globalVarible');
  const arr = len243nx('SVRWShdXQRdKXlpaF1pWVBdaVw==', {});
  console.log('len243-nx 返回长度:', arr.length);
  console.log('前 40:', arr.slice(0, 40).join(','));
  // 标头分析
  const headers = [3, 10, 7, 0, 6, 2, 9, 13];
  for (let i = 0; i < arr.length - 1; i++) {
    if (headers.includes(arr[i])) {
      const len = arr[i + 1];
      if (len !== undefined && len > 0 && len < 300 && i + 2 + len <= arr.length) {
        console.log('标头@' + i + '=' + arr[i], 'len=' + len, '段=' + arr.slice(i + 2, Math.min(i + 2 + len, i + 14)).join(','));
      }
    }
  }
  // 找 4 字节时间戳（当前时间附近）
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < arr.length - 4; i++) {
    const v = (arr[i] << 24) | (arr[i + 1] << 16) | (arr[i + 2] << 8) | arr[i + 3];
    if (Math.abs(v - now) < 86400) console.log('时间戳 @' + i + ':', v, new Date(v * 1000).toISOString());
  }
  // 可打印字符区（ASCII 字符串段）
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] >= 32 && arr[i] <= 126) {
      let j = i;
      while (j < arr.length && arr[j] >= 32 && arr[j] <= 126) j++;
      if (j - i >= 4) console.log('ASCII 串 @' + i + ':', arr.slice(i, j).map(c => String.fromCharCode(c)).join(''));
      i = j - 1;
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
