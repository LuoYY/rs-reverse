/**
 * 157_self_decrypt_b64.js
 *
 * 用 base64url basestr 解码 95 号 cookie → keys16 + runTime 反解（uuid 校验）
 * 若自洽 → base64url basestr 顺序对（编码自洽）→ 412 是 basearr
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
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
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
  console.log('nsd:', s.nsd, 'runTime:', s.runTime, 'keys16:', s.keys16.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('base64url 解码:', bytes ? bytes.length + ' B' : '失败');
  if (!bytes) process.exit(0);

  // 反解（runTime + ele 遍历）
  let found = null;
  for (let t = s.runTime - 3600; t <= s.runTime + 3600 && !found; t++) {
    for (let ele = 1; ele <= 2 && !found; ele++) {
      try {
        const arr = numarrAddTime([...s.keys16], t, ele / 256)[0];
        const dec = encryptMode2([...bytes], arr, 1);
        if (dec.length > 20) {
          const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
          if (calc.every((b, i) => b === dec[i])) { found = { t, ele, dec }; break; }
        }
      } catch (e) {}
    }
  }
  if (found) {
    console.log('★★★ 自洽反解成功 t=' + found.t, 'ele=' + found.ele);
    const na = found.dec.slice(4);
    console.log('nextarr 前 16:', na.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const rk2 = na.slice(11, 59);
    console.log('反解 keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('推导 keys2:', s.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('keys2 一致:', rk2.every((v, i) => v === s.keys2[i]) ? '★★★ YES（base64url basestr 顺序正确!）' : 'NO（顺序不对?）');
    console.log('nextarr 总长:', na.length);
  } else {
    console.log('反解失败（base64url 顺序或 keys/runTime 问题）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
