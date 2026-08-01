/**
 * 131_self_test_decrypt.js
 *
 * 1. 自洽测试：手动生成 cookie（推导 keys + 固定 time/random）→ 反解 → 验证逻辑
 * 2. 完整 ele(1-256) 反解 derived cookie → 确认外层解密（runTime 窗口 + ele）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

function decodeStr(s) {
  const payload = s.startsWith('0') ? s.slice(1) : s;
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  return bytes;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  // 1. 自洽测试
  const plain = Array.from({ length: 100 }, (_, i) => (i * 7) % 256);
  const rt = Math.floor(Date.now() / 1000);
  const random = 0.5;
  const key = numarrAddTime([...K16], rt, random)[0];
  const enc = encryptMode1([...plain], key, 1, random);
  const dec = encryptMode2([...enc], key, 1);
  const same = dec.length === plain.length && dec.every((v, i) => v === plain[i]);
  console.log('自洽测试: enc len=' + enc.length, 'dec len=' + dec.length, '一致:', same ? '★★★ YES（逻辑对）' : 'NO');

  // 2. 完整反解 derived cookie
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[0])));
  const bytes = decodeStr(s.cookie.split('=')[1]);
  const capturedAt = s.capturedAt;
  const center = Math.floor(capturedAt / 1000);
  console.log('\n反解 nsd:', s.nsd, 'capturedAt:', new Date(capturedAt).toISOString(), 'cookie 解码:', bytes.length, 'B');
  console.log('keys16:', s.keys16.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 先试中心时间 ±7200 × ele 1-256（完整）
  let found = null;
  let maxLen = 0;
  const t0 = Date.now();
  for (let t = center - 7200; t <= center + 7200 && !found; t++) {
    for (let ele = 1; ele <= 256 && !found; ele++) {
      try {
        const arr = numarrAddTime([...s.keys16], t, ele / 256)[0];
        const dec = encryptMode2([...bytes], arr, 1);
        if (dec.length > maxLen) maxLen = dec.length;
        if (dec.length > 20) {
          const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
          if (calc.every((b, i) => b === dec[i])) { found = { t, ele, dec }; break; }
        }
      } catch (e) {}
    }
  }
  console.log('耗时:', Date.now() - t0, 'ms', '最大解密长度:', maxLen);
  if (found) {
    console.log('★★★ 反解成功 t=' + found.t, 'ele=' + found.ele, 'dec len=' + found.dec.length);
    const na = found.dec.slice(4);
    console.log('nextarr 前 20:', na.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const rk2 = na.slice(11, 59);
    console.log('反解 keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('推导 keys2:', s.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  } else {
    console.log('反解失败（最大解密长度 ' + maxLen + '）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
