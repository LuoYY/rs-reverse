/**
 * 186_self_decrypt_wide.js
 *
 * 95 号生成的 cookie（base64url basestr）→ 遍历 runTime（±86400）→ keys16 反解
 * 若自洽 → base64url basestr 完全对 → 412 根因是 basearr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function decodeWith(str, basestr) {
  const payload = str.startsWith('0') ? str.slice(1) : str;
  const idxmap = {}; for (let i = 0; i < basestr.length; i++) idxmap[basestr[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(payload.length / 4); g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) return null;
    qi += 4;
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

  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const cookie = s.cookie.split('=')[1];
  const bytes = decodeWith(cookie, B64);
  const center = Math.floor(s.capturedAt / 1000);
  console.log('nsd:', s.nsd, 'capturedAt:', center, 'runTime 保存:', s.runTime, '解码:', bytes.length, 'B');

  let found = null;
  const t0 = Date.now();
  for (let t = center - 86400; t <= center + 86400 && !found; t++) {
    try {
      const arr = numarrAddTime([...s.keys16], t, 1 / 256)[0];
      const dec = encryptMode2([...bytes], arr, 1);
      if (dec.length > 20) {
        const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
        if (calc.every((b, i) => b === dec[i])) { found = { t, dec }; break; }
      }
    } catch (e) {}
  }
  console.log('耗时:', Date.now() - t0, 'ms');
  if (found) {
    console.log('★★★ 自洽反解成功 t=' + found.t);
    const na = found.dec.slice(4);
    console.log('nextarr 前 16:', na.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const rk2 = na.slice(11, 59);
    console.log('反解 keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('推导 keys2:', s.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('keys2 一致:', rk2.every((v, i) => v === s.keys2[i]) ? '★★★ YES（base64url basestr 完全正确!）' : 'NO');
    console.log('nextarr 总长:', na.length);
    const baLen = ((na[9] & 127) << 8) | na[10];
    console.log('basearr 加密段 len:', baLen, '剩余:', na.length - 11);
  } else {
    console.log('自洽反解失败（base64url 顺序不对 或 外层加密结构不同）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
