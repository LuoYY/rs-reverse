// 完整对比重构 cookie 的 na 与原 na，定位 412 根因。
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
function getTree() { let a = []; for (let i = 1; i < 255; i++)a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) { if (it.total <= a[i].total) { a.splice(i, 0, it); return } } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const m = byLen[val]; if (m && m[key] !== undefined) { ans.push(m[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }
function eq(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

(async () => {
  const ctx = await nx.init({ timeout: 50000, log: () => {} });
  const Pval = ctx.cookieP.split('=')[1];
  const pBytes = dB64(Pval.slice(1));
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = parser.encryptMode2([...pBytes], k16a, 1);
  const naOrig = dec.slice(4);
  const cookieK2 = naOrig.slice(11, 59);
  const beLen = (naOrig[59] & 0x7f) << 8 | naOrig[60];
  const be = naOrig.slice(61, 61 + beLen);
  const k17a = parser.numarrAddTime([...ctx.keys17], 0, 1 / 256)[0];
  const tmp = parser.encryptMode2([...be], k17a, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  const base = hdecRaw(huff);
  const r2mka = ((naOrig[2] << 24 | naOrig[3] << 16 | naOrig[4] << 8 | naOrig[5]) >>> 0);
  const startT = ((naOrig[6] << 24 | naOrig[7] << 16 | naOrig[8] << 8 | naOrig[9]) >>> 0);
  console.log('[NC] 原 na.len=' + naOrig.length + ' base.len=' + base.length);
  // 用 ele=0（best）重构
  const ka = parser.numarrAddTime([...ctx.keys17], r2mka, 0)[0];
  const beRe = parser.encryptMode1(parser.xor(parser.numarrEncrypt(base), ctx.keys2, 16), ka, 0);
  console.log('[NC] beRe.len=' + beRe.length + ' vs be.len=' + be.length);
  let diff = [];
  for (let i = 0; i < Math.max(beRe.length, be.length); i++) if (beRe[i] !== be[i]) diff.push(i);
  console.log('[NC] be 差异位置(' + diff.length + '): ' + diff.slice(0, 20).join(','));
  // 重构完整 na
  const naRe = [4, 8, ...parser.numToNumarr4(r2mka), ...parser.numToNumarr4(startT), 48, ...ctx.keys2, beRe.length >> 8 & 255 | 128, beRe.length & 255, ...beRe];
  console.log('[NC] 重构 na.len=' + naRe.length + ' vs 原 ' + naOrig.length);
  const ndiff = [];
  for (let i = 0; i < Math.max(naRe.length, naOrig.length); i++) if (naRe[i] !== naOrig[i]) ndiff.push(i);
  console.log('[NC] na 差异位置(' + ndiff.length + '): ' + ndiff.slice(0, 30).join(','));
  // 外层 uuid：对比重构 cookie 与原 cookie 的 na[0:4]（uuid 前4? 不，uuid 在外层 encryptMode1 的 IV 里）
  console.log('[NC] 原 na[0:2]=' + naOrig.slice(0, 2).join(',') + ' 重构 na[0:2]=' + naRe.slice(0, 2).join(','));
  // 完整重构 cookie 并打 API
  const runTime = Math.floor(Date.now() / 1000);
  const random = Math.random();
  const nextarr = parser.numarrJoin(
    parser.numarrJoin(2, parser.numToNumarr4([r2mka, startT]), ctx.keys2),
    beRe.length >> 8 & 255 | 128,
    beRe,
  );
  const cookie = 'a' + parser.numarr2string(
    parser.encryptMode1(
      [...parser.numToNumarr4(parser.uuid(nextarr)), ...nextarr],
      parser.numarrAddTime([...K16], runTime, random)[0],
      1, random
    ),
    NX_BS.slice(0, 64).split('')
  );
  const { httpGet } = require('./proxy_http');
  const API = '/px-common-authcenter/auth/v2/captcha/get';
  const q = nx.genQuery(API, ctx.keys2, ctx.keys17);
  const rr = await httpGet(nx.TARGET + API, { userAgent: nx.UA, timeout: 20000, headers: { Cookie: cookie, Accept: '*/*', [nx.QUERY_PARAM]: q } });
  console.log('[NC] 重构 cookie API → ' + rr.status + (rr.error ? ' ' + rr.error : ''));
  process.exit(0);
})().catch(e => { console.error('[NC] FATAL:', e && e.message); process.exit(1); });
