/**
 * 185_wide_decrypt_det.js
 *
 * det_cookie 宽窗口解密（base64url + keys16 + runTime ±172800，ele 1）
 * 验证 base64url 完整顺序（若成功 → basestr 确定）
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
  const decrypt = require('@src/handler/parser/common/decrypt');

  const files = fs.readdirSync(OUT).filter(f => f.startsWith('det_cookie_')).sort();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const nsd = d.nsd, cd = d.cd, pCookie = d.pCookie;
  const fixedTime = d.fixedTime;
  console.log('nsd:', nsd, 'fixedTime:', fixedTime);

  // 推导 keys
  const cdArr = decrypt(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  function getLensGo(numarr, idx) {
    const item = numarr[idx]; idx++;
    let lens;
    if ((item & 128) === 0) lens = item;
    else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
    else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
    else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
    else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
    else lens = item;
    return [lens, idx];
  }
  function genKeysSim(ans) {
    const keys = [];
    let op = 1, gap;
    try {
      for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap; }
    } catch (e) { return null; }
    return keys;
  }
  let offset = null, keys = null;
  const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
  for (let k0 = 0; k0 <= 127 && !offset; k0++) {
    const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
    for (let k1 = 0; k1 <= 127 && !offset; k1++) {
      const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
      const off = [off0, off1, off2, off3, off4, off5, off6, off7];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      const kk = genKeysSim(ans);
      if (kk && [29, 30, 31, 32].every(k => kk[k] && kk[k].length === 4) && kk[2] && kk[2].length === 48) { offset = off; keys = kk; }
    }
  }
  if (!keys) { console.log('keys 推导失败'); process.exit(1); }

  const bytes = decodeWith(pCookie, B64);
  console.log('解码:', bytes.length, 'B');

  const now = Math.floor(fixedTime / 1000);
  let found = null;
  const t0 = Date.now();
  for (let t = now - 172800; t <= now + 172800 && !found; t++) {
    try {
      const arr = numarrAddTime([...keys[16]], t, 1 / 256)[0];
      const dec = encryptMode2([...bytes], arr, 1);
      if (dec.length > 20) {
        const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
        if (calc.every((b, i) => b === dec[i])) { found = { t, dec }; break; }
      }
    } catch (e) {}
  }
  console.log('耗时:', Date.now() - t0, 'ms');
  if (found) {
    console.log('★★★ 解密成功 t=' + found.t, new Date(found.t * 1000).toISOString());
    const na = found.dec.slice(4);
    console.log('nextarr 前 16:', na.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const rk2 = na.slice(11, 59);
    console.log('反解 keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('推导 keys2:', keys[2].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('keys2 一致:', rk2.every((v, i) => v === keys[2][i]) ? '★★★ YES（basestr=base64url 完整确定!）' : 'NO');
    console.log('nextarr 总长:', na.length);
  } else {
    console.log('宽窗口解密失败（base64url 顺序不对或 runTime/结构问题）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
