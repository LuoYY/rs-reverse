/**
 * 148_check_basestr.js
 *
 * 检查 nx cookie 的字符集是否与默认 basestr 一致
 * 若不同 → nx basestr 不同 → len243-nx 需要加 basestr → 412 根因
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const DEFAULT_BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

(async () => {
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const cookie = s.cookie.split('=')[1];
  console.log('cookie len:', cookie.length);

  // cookie 字符集
  const chars = new Set(cookie.split(''));
  console.log('cookie 唯一字符数:', chars.size);
  console.log('cookie 字符:', [...chars].sort().join(''));

  // 默认 basestr 字符集
  const baseChars = new Set(DEFAULT_BASESTR.split(''));
  console.log('\n默认 basestr 长度:', DEFAULT_BASESTR.length);

  // cookie 字符是否都在默认 basestr
  const notInBase = [...chars].filter(c => !baseChars.has(c));
  console.log('cookie 字符不在默认 basestr:', notInBase.length ? notInBase.join('') : '无（全匹配）');

  // 对比浏览器 cookie（sync）
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const bP = (sync.cookies || []).find(c => c.name.endsWith('P'));
  if (bP) {
    const bChars = new Set(bP.value.split(''));
    console.log('\n浏览器 cookie 唯一字符数:', bChars.size);
    console.log('浏览器 cookie 字符:', [...bChars].sort().join(''));
    const bNotIn = [...bChars].filter(c => !baseChars.has(c));
    console.log('浏览器 cookie 字符不在默认 basestr:', bNotIn.length ? bNotIn.join('') : '无（全匹配）');
    // 浏览器 vs 我的 cookie 字符集差异
    const diff = [...bChars].filter(c => !chars.has(c));
    console.log('浏览器有但我的没有:', diff.length ? diff.join('') : '无');
  }

  // 用默认 basestr 解码浏览器 cookie → 长度（应 4 的倍数）
  const idxmap = {}; for (let i = 0; i < DEFAULT_BASESTR.length; i++) idxmap[DEFAULT_BASESTR[i]] = i;
  const payload = bP.value.startsWith('0') ? bP.value.slice(1) : bP.value;
  console.log('\n浏览器 payload 长度:', payload.length, '（mod 4:', payload.length % 4 + '）');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
