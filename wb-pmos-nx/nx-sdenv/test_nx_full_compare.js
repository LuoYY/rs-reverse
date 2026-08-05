// 完整对比原样 cookie 与重构 cookie 的解密结果（uuid + na）。
// 用相同解密流程，确认重构是否与原样完全一致（除随机 IV）。
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));
const nx = require('./nx_client');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
function dB64(s) { const m = {}; for (let i = 0; i < 64; i++)m[NX_BS[i]] = i; const o = []; let q = 0; for (let g = 0; g < Math.floor(s.length / 4); g++) { const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]]; q += 4; if (c0 === undefined) return null; o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3) } const r = s.length - q; if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4)); else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2)); return o }
function decodeCookie(Pval) {
  const pBytes = dB64(Pval.slice(1));
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = parser.encryptMode2([...pBytes], k16a, 1);
  return dec;
}

(async () => {
  const ctx = await nx.init({ timeout: 50000, log: () => {} });
  const Pval = ctx.cookieP.split('=')[1];
  const decOrig = decodeCookie(Pval);
  const uuidOrig = decOrig.slice(0, 4);
  const naOrig = decOrig.slice(4);
  const beLen = (naOrig[59] & 0x7f) << 8 | naOrig[60];
  const beOrig = naOrig.slice(61, 61 + beLen);
  const r2mka = ((naOrig[2] << 24 | naOrig[3] << 16 | naOrig[4] << 8 | naOrig[5]) >>> 0);
  const startT = ((naOrig[6] << 24 | naOrig[7] << 16 | naOrig[8] << 8 | naOrig[9]) >>> 0);
  console.log('[FC] 原样: uuid=' + uuidOrig.join(',') + ' na.len=' + naOrig.length + ' be.len=' + beOrig.length);
  // 重构（beOrig 原样）。★ nx nextarr 头是 [4,8]（非项目 numarrJoin(2,...) 的 [2,8]）
  const nextarr = [4, 8, ...parser.numToNumarr4(r2mka), ...parser.numToNumarr4(startT), 48, ...ctx.keys2, beOrig.length >> 8 & 255 | 128, beOrig.length & 255, ...beOrig];
  const u4 = parser.numToNumarr4(parser.uuid(nextarr));
  const runTime = r2mka;
  const random = Math.random();
  const cookie = 'a' + parser.numarr2string(
    parser.encryptMode1([...u4, ...nextarr], parser.numarrAddTime([...K16], runTime, random)[0], 1, random),
    NX_BS.slice(0, 64).split('')
  );
  // 解重构（cookie 值含 = padding，直接用完整值）
  const decRe = decodeCookie(cookie);
  const uuidRe = decRe.slice(0, 4);
  const naRe = decRe.slice(4);
  console.log('[FC] 重构: uuid=' + uuidRe.join(',') + ' na.len=' + naRe.length);
  console.log('[FC] uuid 一致?', JSON.stringify(uuidOrig) === JSON.stringify(uuidRe));
  console.log('[FC] na 一致?', JSON.stringify(naOrig) === JSON.stringify(naRe));
  // na 逐字段
  const fields = [
    ['[0:2]头', naOrig.slice(0, 2), naRe.slice(0, 2)],
    ['[2:6]r2mka', naOrig.slice(2, 6), naRe.slice(2, 6)],
    ['[6:10]start', naOrig.slice(6, 10), naRe.slice(6, 10)],
    ['[10]48', [naOrig[10]], [naRe[10]]],
    ['[11:59]keys2', naOrig.slice(11, 59), naRe.slice(11, 59)],
    ['[59:61]beLen', naOrig.slice(59, 61), naRe.slice(59, 61)],
    ['[61:]be', naOrig.slice(61), naRe.slice(61)],
  ];
  for (const [name, a, b] of fields) {
    const same = JSON.stringify(a) === JSON.stringify(b);
    console.log('[FC] ' + name + (same ? ' ✓一致' : ' ✗不同 len=' + a.length + '/' + b.length));
    if (!same && a.length < 60) console.log('[FC]   原:' + a.join(',') + '\n      重构:' + b.join(','));
  }
  process.exit(0);
})().catch(e => { console.error('[FC] FATAL:', e && e.message); process.exit(1); });
