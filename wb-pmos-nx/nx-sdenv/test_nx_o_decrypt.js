// 尝试解密 O cookie，找 base 环境编码的输入。
// O 是服务器 Set-Cookie 下发。试各密钥 decryptMode2/encryptMode2。
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
function henc(num) { const ans = []; let one = 0, two = 0; for (const b of num) { const c = cfg[b]; if (!c) continue; one = one << c.val | c.key; two += c.val; while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8 } } if (two > 0) ans.push(one << 8 - two | 0x68 >> two); return ans }
function bestTrim(raw, huff) { const hh = huff.slice(0, huff.length - 1); for (let L = raw.length; L >= 1; L--) { const e = henc(raw.slice(0, L)); if (JSON.stringify(e.slice(0, e.length - 1)) === JSON.stringify(hh)) return raw.slice(0, L) } return raw }

(async () => {
  const ctx = await nx.init({ timeout: 50000, log: () => {} });
  const Oval = ctx.cookieO.split('=')[1];
  console.log('[OD] O 值 len=' + Oval.length + ' 前20=' + Oval.slice(0, 20));
  // O 解码（b86 前64）
  const oBytes = dB64(Oval);
  console.log('[OD] O 解码 len=' + oBytes.length + ' [0:8]=' + oBytes.slice(0, 8).join(','));
  // 解 base 对照
  const Pval = ctx.cookieP.split('=')[1];
  const pBytes = dB64(Pval.slice(1));
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = parser.encryptMode2([...pBytes], k16a, 1);
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const k17a = parser.numarrAddTime([...ctx.keys17], 0, 1 / 256)[0];
  const tmp = parser.encryptMode2([...be], k17a, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  const base = bestTrim(hdecRaw(huff), huff);
  console.log('[OD] base.len=' + base.length + ' [45:70]=' + base.slice(45, 70).join(','));
  // 试解密 O
  const trials = [
    ['encryptMode2(keys16, f1)', oBytes, [...K16], 1],
  ];
  for (const [nm, data, key, flag] of trials) {
    try {
      const r = parser.encryptMode2([...data], key, flag);
      console.log('[OD] ' + nm + ' → len=' + r.length + ' [0:16]=' + r.slice(0, 16).join(','));
      if (r.length > 16) console.log('[OD]   [16:32]=' + r.slice(16, 32).join(','));
    } catch (e) { console.log('[OD] ' + nm + ' ERR ' + e.message.slice(0, 50)); }
  }
  // O 可能与 base 环境段有直接关系（不加密）
  // 找 O 字节与 base[45:] 的共享/变换
  const base45 = base.slice(45, 70);
  const o32 = oBytes.slice(0, 32);
  console.log('[OD] base[45:70]=' + base45.join(','));
  console.log('[OD] O[0:32]    =' + o32.join(','));
  // base[45:70] XOR O[0:25]?
  console.log('[OD] base[45:70] XOR O[0:25]=' + base45.map((v, i) => v ^ oBytes[i]).join(','));
  // base[45:70] XOR O[32:57]?
  console.log('[OD] base[45:70] XOR O[32:57]=' + base45.map((v, i) => v ^ oBytes[32 + i]).join(','));
  process.exit(0);
})().catch(e => { console.error('[OD] FATAL:', e && e.message); process.exit(1); });
