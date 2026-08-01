/**
 * 155_multi_basestr_decrypt.js
 *
 * 多种 basestr 解码 jsdom cookie + 全 keys16 候选 + 宽时间窗口解密（uuid 校验）
 * 找到能解密的 basestr → 反推 nx basestr 完整顺序
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const CANDIDATE_BASESTRS = {
  base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  base64url2: '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
  default86: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^',
  browserChars: '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
};

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
  const k16cands = d.k16s || [];
  const now = Math.floor(Date.now() / 1000);

  for (const [label, bs] of Object.entries(CANDIDATE_BASESTRS)) {
    const bytes = decodeWith(pCookie, bs);
    if (!bytes) { console.log(label, ': 解码失败'); continue; }
    console.log(label, ': 解码', bytes.length, 'B, 遍历 keys16 候选', k16cands.length, '个...');
    let found = null;
    const t0 = Date.now();
    for (let ki = 0; ki < k16cands.length && !found; ki++) {
      const k16 = k16cands[ki];
      for (let t = now - 86400; t <= now + 86400 && !found; t++) {
        try {
          const arr = numarrAddTime([...k16], t, 1 / 256)[0];
          const dec = encryptMode2([...bytes], arr, 1);
          if (dec.length > 20) {
            const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
            if (calc.every((b, i) => b === dec[i])) { found = { ki, k16, t, dec }; break; }
          }
        } catch (e) {}
      }
    }
    console.log(label, '耗时', Date.now() - t0, 'ms', found ? '★★★ 解密成功!' : '失败');
    if (found) {
      console.log('  keys16 候选#' + found.ki, 't=' + found.t, 'keys16:', found.k16.map(b => b.toString(16).padStart(2, '0')).join(' '));
      const na = found.dec.slice(4);
      console.log('  nextarr 前 16:', na.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
      // 反推 basestr
      const payload = pCookie.startsWith('0') ? pCookie.slice(1) : pCookie;
      const map = {};
      for (let i = 0; i + 2 < bytes.length; i += 3) {
        const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
        const idxs = [b0 >> 2, ((b0 & 3) << 4) | (b1 >> 4), ((b1 & 15) << 2) | (b2 >> 6), b2 & 63];
        for (let j = 0; j < 4; j++) {
          const c = payload[(i / 3) * 4 + j];
          if (c === undefined) break;
          if (map[idxs[j]] !== undefined && map[idxs[j]] !== c) console.log('冲突 @idx=' + idxs[j]);
          map[idxs[j]] = c;
        }
      }
      const bsArr = [];
      for (let i = 0; i < 64; i++) bsArr.push(map[i] !== undefined ? map[i] : '?');
      console.log('  反推 basestr:', bsArr.join(''));
      console.log('  已知:', Object.keys(map).length + '/64');
      fs.writeFileSync(path.join(OUT, 'nx_basestr_found.json'), JSON.stringify({ basestr: bsArr.join(''), map, label }));
      process.exit(0);
    }
  }
  console.log('\n所有 basestr 解密失败');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
