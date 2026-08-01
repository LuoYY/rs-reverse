/**
 * 154_jsdom_decrypt_basestr.js
 *
 * jsdom 自洽解密：用数组陷阱的 16B keys 候选 + runTime 遍历，
 * 解密 jsdom cookie（base64url basestr 假设解码）→ uuid 校验
 * 若成功 → basestr 顺序确认；失败 → 需反推
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

  const file = fs.readdirSync(OUT).filter(f => f.startsWith('jsdom_basestr_')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, file)));
  const pCookie = d.pCookie.split('=')[1];
  console.log('jsdom cookie:', pCookie.length, '字符');

  // 用 base64url 解码
  const bytes = decodeWith(pCookie, B64);
  console.log('base64url 解码:', bytes ? bytes.length + ' B' : '失败（字符不在 base64url）');
  if (!bytes) process.exit(0);

  // 遍历 16B keys 候选 + runTime 遍历
  const now = Math.floor(Date.now() / 1000);
  const k16cands = d.k16s || [];
  console.log('16B 候选数:', k16cands.length);
  let found = null;
  for (let ki = 0; ki < k16cands.length && !found; ki++) {
    const k16 = k16cands[ki];
    for (let t = now - 3600; t <= now + 3600 && !found; t++) {
      for (let ele = 1; ele <= 2 && !found; ele++) {
        try {
          const arr = numarrAddTime([...k16], t, ele / 256)[0];
          const dec = encryptMode2([...bytes], arr, 1);
          if (dec.length > 20) {
            const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
            if (calc.every((b, i) => b === dec[i])) { found = { ki, k16, t, ele, dec }; break; }
          }
        } catch (e) {}
      }
    }
  }
  if (found) {
    console.log('★★★ 解密成功! keys16 候选#' + found.ki, 't=' + found.t, 'ele=' + found.ele);
    console.log('keys16:', found.k16.map(b => b.toString(16).padStart(2, '0')).join(' '));
    const na = found.dec.slice(4);
    console.log('nextarr 前 20:', na.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));
    // 反推 basestr：密文字节分组 → cookie 字符
    console.log('\n反推 basestr（用已知密文 + cookie 字符）:');
    // 密文 = bytes（外层加密），cookie 字符 = pCookie
    // 密文前 3 字节 → cookie 前 4 字符（去掉前缀 0）
    const payload = pCookie.startsWith('0') ? pCookie.slice(1) : pCookie;
    const map = {};
    for (let i = 0; i + 2 < bytes.length; i += 3) {
      const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
      const idxs = [b0 >> 2, ((b0 & 3) << 4) | (b1 >> 4), ((b1 & 15) << 2) | (b2 >> 6), b2 & 63];
      for (let j = 0; j < 4; j++) {
        const c = payload[i / 3 * 4 + j];
        if (c === undefined) break;
        if (map[idxs[j]] !== undefined && map[idxs[j]] !== c) console.log('冲突 @idx=' + idxs[j], map[idxs[j]], 'vs', c);
        map[idxs[j]] = c;
      }
    }
    // 打印 basestr（按索引排序）
    const bs = [];
    for (let i = 0; i < 64; i++) bs.push(map[i] !== undefined ? map[i] : '?');
    console.log('反推 basestr:', bs.join(''));
    console.log('已知字符数:', Object.keys(map).length + '/64');
  } else {
    console.log('解密失败（base64url basestr 或 keys/runTime 不对）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
