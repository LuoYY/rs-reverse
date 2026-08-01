/**
 * 130_decrypt_derived_cookie.js
 *
 * 反解 derived cookie（推导 keys16==K16 确认）：遍历时间窗口，检查解密结构（dec[4] 分布）
 * 确认外层反解失败原因：时间错 vs keys16 错 vs basearr 错
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

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

  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[0])));
  const keys16 = s.keys16;
  console.log('nsd:', s.nsd, 'keys16:', keys16.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
  const bytes = decodeStr(s.cookie.split('=')[1]);
  console.log('cookie 解码:', bytes.length, 'B');
  const capturedAt = s.capturedAt;
  console.log('capturedAt:', new Date(capturedAt).toISOString());
  const center = Math.floor(capturedAt / 1000);
  console.log('时间中心:', center);

  // 预计算 keys16time（每 ele 一个）——优化
  // 遍历时间（±3600）× ele，收集 dec 结构
  const stats = {};
  let samples = [];
  const t0 = Date.now();
  for (let t = center - 3600; t <= center + 3600; t++) {
    for (let ele = 1; ele <= 128; ele++) {  // 减半 ele 范围加速
      try {
        const arr = numarrAddTime([...keys16], t, ele / 256)[0];
        const dec = encryptMode2([...bytes], arr, 1);
        if (dec.length >= 30) {
          const key = `len=${dec.length},d0=${dec[0]},d4=${dec[4]},d8=${dec[8]}`;
          stats[key] = (stats[key] || 0) + 1;
          if (samples.length < 5 && dec[4] === 2) samples.push({ t, ele, dec });
        }
      } catch (e) {}
    }
    if (Date.now() - t0 > 90000) break; // 限时 90s
  }
  console.log('耗时:', Date.now() - t0, 'ms');
  console.log('dec 结构分布 (前 10):');
  Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log(' ', k, 'x' + v));
  if (samples.length) {
    const sp = samples[0];
    console.log('★ dec[4]===2 样本 t=' + sp.t, 'ele=' + sp.ele);
    console.log('  dec 前 30:', sp.dec.slice(0, 30).map(b => b.toString(16).padStart(2, '0')).join(' '));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
