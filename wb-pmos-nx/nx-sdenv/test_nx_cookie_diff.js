// 对比 sdenv 原样 cookie 与 buildCookie 重构 cookie 的解码结构，定位重构 bug。
const fs = require('fs');
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

function decodeP(Pval, keys17) {
  const pBytes = dB64(Pval.slice(1));
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = parser.encryptMode2([...pBytes], k16a, 1);
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const k17a = parser.numarrAddTime([...keys17], 0, 1 / 256)[0];
  const tmp = parser.encryptMode2([...be], k17a, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  return { na, cookieK2, beLen, be, base: hdecRaw(huff) };
}

(async () => {
  console.log('[DF] 初始化...');
  const ctx = await nx.init({ timeout: 50000, log: () => {} });
  const Pval = ctx.cookieP.split('=')[1];
  const orig = decodeP(Pval, ctx.keys17);
  console.log('[DF] 原样 cookie: na.len=' + orig.na.length + ' beLen=' + orig.beLen + ' base.len=' + orig.base.length + ' base头=' + orig.base.slice(0, 8).join(','));
  console.log('[DF]   原 na[2:10] r2mka/start:', orig.na.slice(2, 10).join(','));
  console.log('[DF]   原 keys2==ctx.keys2?', JSON.stringify(orig.cookieK2) === JSON.stringify(ctx.keys2));
  // 重构
  const r2mka = ((orig.na[2] << 24 | orig.na[3] << 16 | orig.na[4] << 8 | orig.na[5]) >>> 0);
  const startT = ((orig.na[6] << 24 | orig.na[7] << 16 | orig.na[8] << 8 | orig.na[9]) >>> 0);
  const runTime = Math.floor(Date.now() / 1000);
  const random = Math.random();
  const basearrEncrypt = parser.encryptMode1(
    parser.xor(parser.numarrEncrypt(orig.base), ctx.keys2, 16),
    parser.numarrAddTime([...ctx.keys17], runTime, random)[0],
    0
  );
  console.log('[DF] 重构 basearrEncrypt.len=' + basearrEncrypt.length + ' vs 原 beLen=' + orig.beLen + ' be.len=' + orig.be.length);
  // 对比 be
  const origBeXor = orig.be;
  console.log('[DF] 原 be[0:8]:', origBeXor.slice(0, 8).join(','));
  // be 是 encryptMode1 输出（CBC 无 IV），与 basearrEncrypt 应一致（除 runTime 影响 keys17+time）
  // 用 orig 的 r2mka 作为 runTime 重构试试
  const basearrEncrypt2 = parser.encryptMode1(
    parser.xor(parser.numarrEncrypt(orig.base), ctx.keys2, 16),
    parser.numarrAddTime([...ctx.keys17], r2mka, 0.5)[0],
    0
  );
  console.log('[DF] 用 r2mka 重构 basearrEncrypt[0:8]:', basearrEncrypt2.slice(0, 8).join(','));
  console.log('[DF] 原 be[0:8]:                      ', origBeXor.slice(0, 8).join(','));
  console.log('[DF] 匹配?', JSON.stringify(basearrEncrypt2) === JSON.stringify(origBeXor));
  process.exit(0);
})().catch(e => { console.error('[DF] FATAL:', e && e.message); process.exit(1); });
