/**
 * 150_analyze_cookie_chars.js
 *
 * 跑 95 号（1 会话）→ 分析 cookie 字符集 + 用 86 basestr 解码
 * 确认 cookie 编码 basestr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const DEFAULT_BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

(async () => {
  // 跑 95 号（1 会话）
  console.log('跑 95 号...');
  try { execSync('node wb-pmos-nx/95_nx_proxy_online.js 1 > /tmp/95t50.txt 2>&1', { cwd: ROOT, timeout: 120000, stdio: 'ignore' }); } catch (e) {}
  // 找最新 derived
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const cookie = s.cookie.split('=')[1];
  console.log('最新 derived nsd:', s.nsd, 'status:', s.status, 'cookie len:', cookie.length);

  const chars = [...new Set(cookie.split(''))].sort();
  console.log('cookie 唯一字符:', chars.join(''));
  console.log('字符数:', chars.length);

  // 用 86 basestr 解码（检查 4 的倍数）
  const idxmap = {}; for (let i = 0; i < DEFAULT_BASESTR.length; i++) idxmap[DEFAULT_BASESTR[i]] = i;
  const payload = cookie.startsWith('0') ? cookie.slice(1) : cookie;
  let allIn = true;
  for (const c of chars) if (idxmap[c] === undefined) allIn = false;
  console.log('cookie 字符全在 86 basestr:', allIn ? 'YES' : 'NO');
  // 解码长度
  const bytes = [];
  let qi = 0;
  for (let g = 0; g < Math.floor(payload.length / 4); g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) { console.log('字符不在 basestr'); break; }
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  console.log('解码长度:', bytes.length, '（' + payload.length + ' 字符）');

  // 浏览器 cookie 对比
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const bP = (sync.cookies || []).find(c => c.name.endsWith('P'));
  if (bP) {
    const bChars = [...new Set(bP.value.split(''))].sort();
    console.log('\n浏览器 cookie 唯一字符:', bChars.join(''));
    console.log('字符数:', bChars.length);
    const bPayload = bP.value.startsWith('0') ? bP.value.slice(1) : bP.value;
    const bIdx = {}; for (let i = 0; i < DEFAULT_BASESTR.length; i++) bIdx[DEFAULT_BASESTR[i]] = i;
    let bAllIn = true;
    for (const c of bChars) if (bIdx[c] === undefined) bAllIn = false;
    console.log('浏览器 cookie 字符全在 86 basestr:', bAllIn ? 'YES' : 'NO');
    console.log('浏览器 payload len:', bPayload.length, 'mod4:', bPayload.length % 4);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
