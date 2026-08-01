/**
 * 163_derive_basestr.js
 *
 * 用确定性 cookie（固定 random/time）反推 nx basestr：
 * 1. 推导 keys（offset + genKeys）
 * 2. 手动重现 Cookie.run()（86 basestr + 固定参数）→ 密文 enc
 * 3. enc 分组 → 浏览器 cookie 字符 → 反推 nx basestr 顺序
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const DEFAULT_BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const decrypt = require('@src/handler/parser/common/decrypt');
  const parser = require('@src/handler/parser');
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const { xor } = require('@src/handler/parser/common/');
  const { numToNumarr4, uuid, numarrJoin, numarr2string } = parser;

  // 读确定性 cookie
  const file = fs.readdirSync(OUT).filter(f => f.startsWith('det_cookie_')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, file)));
  const nsd = d.nsd, cd = d.cd, pCookie = d.pCookie;
  const random = d.fixedRandom;
  const fixedTime = d.fixedTime;
  const runTime = Math.floor(fixedTime / 1000);
  console.log('nsd:', nsd, 'runTime:', runTime, 'random:', random, 'P cookie:', pCookie.length);

  // 1. 推导 keys
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
  console.log('offset:', offset.map(b => b.toString(16).padStart(2, '0')).join(' '), 'keys16:', keys[16].slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 2. 重现 Cookie.run()（86 basestr）—— 需要 basearr
  // 先用 len243-nx 的固定 basearr（388B）——但可能不对。用"最小重现"：
  // 外层加密 = encryptMode1([uuid(nextarr), nextarr], numarrAddTime(keys16, runTime, random)[0], 1, random)
  // nextarr 含 keys2 + basearrEncrypt（需要 basearr）
  // 关键：nextarr 的前 58 字节（2+time8+keys2 48）不依赖 basearr——但 enc 是整体的
  // 用 len243-nx basearr 重现——enc 可能不对（basearr 错）——但反推 basestr 只需"部分"（enc 的前几字节对应 IV——但 IV 是 random 派生的——确定性）
  const basearr = require('@src/handler/basearr/len243-nx')('SVRWShdXQRdKXlpaF1pWVBdaVw==', {});
  let r2mkaTime = 0;
  if (keys[21]) r2mkaTime = parseInt(keys[21].map(c => String.fromCharCode(c)).join(''), 10);
  const startTime = runTime - 1;
  const basearrEncrypt = encryptMode1(xor(numarrEncrypt(basearr), keys[2], 16), numarrAddTime(keys[17], runTime, random)[0], 0);
  const nextarr = numarrJoin(numarrJoin(2, numToNumarr4([r2mkaTime, startTime]), keys[2]), undefined, basearrEncrypt);
  const enc = encryptMode1([...numToNumarr4(uuid(nextarr)), ...nextarr], numarrAddTime(keys[16], runTime, random)[0], 1, random);
  console.log('重现 enc len:', enc.length);

  // 3. 反推 basestr
  // 浏览器 cookie = '0' + numarr2string(enc, nxBasestr)——同一 enc（如果参数对）
  // 但 enc 依赖 basearr（可能不对）——先用 enc 反推，看冲突
  const payload = pCookie.startsWith('0') ? pCookie.slice(1) : pCookie;
  console.log('浏览器 payload len:', payload.length, 'enc len:', enc.length);
  // enc 3 字节 → 4 索引 → 浏览器 cookie 字符
  const map = {};
  let conflicts = 0, known = 0;
  for (let i = 0; i + 2 < enc.length && (i / 3) * 4 + 3 < payload.length; i += 3) {
    const b0 = enc[i], b1 = enc[i + 1], b2 = enc[i + 2];
    const idxs = [b0 >> 2, ((b0 & 3) << 4) | (b1 >> 4), ((b1 & 15) << 2) | (b2 >> 6), b2 & 63];
    for (let j = 0; j < 4; j++) {
      const c = payload[(i / 3) * 4 + j];
      if (map[idxs[j]] !== undefined) {
        if (map[idxs[j]] !== c) conflicts++;
      } else {
        map[idxs[j]] = c; known++;
      }
    }
  }
  console.log('反推 basestr: 已知 ' + known + '/64, 冲突 ' + conflicts);
  if (conflicts === 0 && known >= 60) {
    const bs = [];
    for (let i = 0; i < 64; i++) bs.push(map[i] !== undefined ? map[i] : '?');
    console.log('nx basestr:', bs.join(''));
    fs.writeFileSync(path.join(OUT, 'nx_basestr.json'), JSON.stringify({ basestr: bs.join(''), map }));
  } else {
    console.log('冲突过多（enc 与浏览器不一致——basearr/keys/参数问题）');
    // 打印已知的字符看是否合理
    const sample = [];
    for (let i = 0; i < 64; i++) if (map[i] !== undefined) sample.push(i + ':' + map[i]);
    console.log('已知映射样例:', sample.slice(0, 20).join(' '));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
