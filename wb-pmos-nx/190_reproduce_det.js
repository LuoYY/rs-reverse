/**
 * 190_reproduce_det.js
 *
 * 手动重现 Cookie.run()（base64url basestr + 推导 keys + basearr + runTime 固定 + random=0.5）
 * 对比浏览器确定性 cookie 前 22（IV 部分）——确认结构/参数是否一致
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const parser = require('@src/handler/parser');
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const { xor } = require('@src/handler/parser/common/');
  const decrypt = require('@src/handler/parser/common/decrypt');
  const { numToNumarr4, uuid, numarrJoin, numarr2string } = parser;

  const files = fs.readdirSync(OUT).filter(f => f.startsWith('det_cookie_')).sort();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const nsd = d.nsd, cd = d.cd, pCookie = d.pCookie;
  const fixedTime = d.fixedTime;
  const runTime = Math.floor(fixedTime / 1000);
  console.log('nsd:', nsd, 'runTime:', runTime, '浏览器 cookie 前 22:', pCookie.substring(0, 22));

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
  console.log('keys16:', keys[16].slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 手动重现（random=0.5 派生）
  const random = 0.5;
  const basearr = require('@src/handler/basearr/len243-nx')('SVRWShdXQRdKXlpaF1pWVBdaVw==', {});
  let r2mkaTime = 0;
  if (keys[21]) r2mkaTime = parseInt(keys[21].map(c => String.fromCharCode(c)).join(''), 10);
  const startTime = runTime - 1;
  const basearrEncrypt = encryptMode1(xor(numarrEncrypt(basearr), keys[2], 16), numarrAddTime(keys[17], runTime, random)[0], 0);
  const nextarr = numarrJoin(numarrJoin(2, numToNumarr4([r2mkaTime, startTime]), keys[2]), undefined, basearrEncrypt);
  const enc = encryptMode1([...numToNumarr4(uuid(nextarr)), ...nextarr], numarrAddTime(keys[16], runTime, random)[0], 1, random);
  const myCookie = '0' + numarr2string(enc, B64.split(''));
  console.log('重现 cookie 前 22:', myCookie.substring(0, 22));
  console.log('浏览器 cookie 前 22:', pCookie.substring(0, 22));
  console.log('前 22 相同:', myCookie.substring(0, 22) === pCookie.substring(0, 22) ? '★★★ YES（结构/random/IV 一致!）' : 'NO');

  // 尝试多个 random 值找 IV 匹配
  let ivMatch = false;
  for (let r2 = 0; r2 <= 1; r2 += 0.01) {
    const enc2 = encryptMode1([...numToNumarr4(uuid(nextarr)), ...nextarr], numarrAddTime(keys[16], runTime, r2)[0], 1, r2);
    const c2 = '0' + numarr2string(enc2, B64.split(''));
    if (c2.substring(0, 22) === pCookie.substring(0, 22)) { console.log('★★★ random=' + r2, 'IV 匹配!'); ivMatch = true; break; }
  }
  console.log('IV 匹配的 random:', ivMatch ? '找到' : '未找到（0-1 步长 0.01）');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
