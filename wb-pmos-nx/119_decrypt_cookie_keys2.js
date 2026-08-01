/**
 * 119_decrypt_cookie_keys2.js
 *
 * 从 sync 浏览器 P cookie 反解 keys2（外层 K16 + capturedAt 时间窗口）
 * 验证 browserKeys.keys2 采集可靠性 → 确定 nx keys 结构
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
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const bP = (sync.cookies || []).find(c => c.name.endsWith('P'));
  console.log('capturedAt:', new Date(sync.capturedAt).toISOString(), 'raw:', sync.capturedAt);
  if (!bP) { console.log('无浏览器 P cookie'); process.exit(1); }
  const bytes = decodeStr(bP.value);
  console.log('浏览器 P cookie:', bP.value.length, '字符, 解码:', bytes.length, 'B');

  const center = Math.floor(sync.capturedAt / 1000);
  console.log('时间中心:', center, new Date(center * 1000).toISOString());

  let found = null;
  // 遍历 ±7200（2 小时窗口）× ele 1-256
  for (let t = center - 7200; t <= center + 7200 && !found; t++) {
    for (let ele = 1; ele <= 256 && !found; ele++) {
      try {
        const arr = numarrAddTime([...K16], t, ele / 256)[0];
        const dec = encryptMode2([...bytes], arr, 1);
        if (dec.length > 20) {
          const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
          if (calc.every((b, i) => b === dec[i])) found = { t, ele, dec };
        }
      } catch (e) {}
    }
  }
  if (found) {
    const na = found.dec.slice(4);
    console.log('★★★ 外层解密成功 t=' + found.t, 'ele=' + found.ele);
    console.log('nextarr 前 16:', na.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    // keys2 在 nextarr 里（找 48 字节段）
    const rk2 = na.slice(11, 59);
    console.log('反解 keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('browserKeys.keys2:', sync.browserKeys.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const ok2 = rk2.length === 48 && rk2.every((v, i) => v === sync.browserKeys.keys2[i]);
    console.log('keys2 与浏览器采集一致:', ok2 ? '★★★ YES（采集可靠）' : 'NO（采集不可靠!）');
    console.log('nextarr 前 60:', na.slice(0, 60).map(b => b.toString(16).padStart(2, '0')).join(' '));
  } else {
    console.log('解密失败（窗口/结构）');
    // 宽松：打印 dec[4]/dec[14] 分布
    console.log('尝试更大窗口 ±86400（简化：只找结构）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
