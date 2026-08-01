/**
 * 126_check_nextarr_struct.js
 *
 * 解密 derived cookie（推导 keys16=K16 + 时间窗口），不校验 uuid，
 * 检查 nextarr 结构（dec[4]/keys2 位置/长度）→ 判断 keys 对错 vs basearr 对错
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
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[0])));
  console.log('nsd:', s.nsd, 'cookie len:', s.cookie.length);
  console.log('推导 keys2:', s.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const bytes = decodeStr(s.cookie.split('=')[1]);
  console.log('cookie 解码:', bytes.length, 'B');
  const now = Math.floor(Date.now() / 1000);
  // 找结构：遍历时间，记录 dec[4]/dec[14] 分布 + keys2 匹配
  const stats = {};
  let best = null;
  for (let t = now - 7200; t <= now + 3600; t++) {
    for (let ele = 1; ele <= 256; ele++) {
      try {
        const arr = numarrAddTime([...K16], t, ele / 256)[0];
        const dec = encryptMode2([...bytes], arr, 1);
        if (dec.length < 30) continue;
        const key = `len=${dec.length},d4=${dec[4]}`;
        stats[key] = (stats[key] || 0) + 1;
        // keys2 匹配检查（dec[4..] 是 nextarr，找 48B 段 == 推导 keys2）
        if (s.keys2) {
          for (let p = 0; p + 48 <= dec.length; p++) {
            let m = 0;
            for (let i = 0; i < 48; i++) if (dec[p + i] === s.keys2[i]) m++;
            if (m > 40) { // 高匹配
              best = { t, ele, p, match: m, dec };
              break;
            }
          }
        }
        if (best) break;
      } catch (e) {}
    }
    if (best) break;
  }
  console.log('dec 结构分布 (前 8):');
  Object.entries(stats).slice(0, 8).forEach(([k, v]) => console.log(' ', k, 'x', v));
  if (best) {
    console.log('★ keys2 高匹配: t=' + best.t, 'pos=' + best.p, 'match=' + best.match + '/48');
    console.log('dec 前 30:', best.dec.slice(0, 30).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('dec[4..15]:', best.dec.slice(4, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('dec 总长:', best.dec.length);
  } else {
    console.log('无 keys2 高匹配（keys2 不在解密结果中 → 推导 keys2 或密钥/结构错）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
