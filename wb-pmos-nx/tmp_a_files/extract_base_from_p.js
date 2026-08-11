// 从 P cookie 直接解 base（用 cookie 内嵌 keys2，无需 cd）
// 两次不同 P → 对比 base
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
function dB64(s) { const m = {}; for (let i = 0; i < 64; i++) m[NX_BS[i]] = i; const o = []; let q = 0; for (let g = 0; g < Math.floor(s.length / 4); g++) { const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]]; q += 4; o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3) } const r = s.length - q; if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4)); else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2)); return o }
function getTree() { let a = []; for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const mm = byLen[val]; if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }
function henc(num) { const ans = []; let one = 0, two = 0; for (const b of num) { const c = cfg[b]; if (!c) continue; one = one << c.val | c.key; two += c.val; while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8 } } if (two > 0) ans.push(one << 8 - two | 0x68 >> two); return ans }
function bestTrim(raw, huff) { const hh = huff.slice(0, huff.length - 1); for (let L = raw.length; L >= 1; L--) { const e = henc(raw.slice(0, L)); if (JSON.stringify(e.slice(0, e.length - 1)) === JSON.stringify(hh)) return raw.slice(0, L) } return raw }
function extractBaseFromP(Pval) {
  const pB = dB64(Pval.slice(1));
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = parser.encryptMode2([...pB], k16a, 1);
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const k17a = parser.numarrAddTime([...K16.map((v, i) => v ^ cookieK2[i % 16])], 0, 1 / 256)[0];
  // keys17 未知，但 be 解密需要 keys17。改用 cookieK2 尝试
  // 从 FINDINGS：be 解密用 keys17，无 keys17 无法解。
  // 但可以对比 na 中相同位置的 be（如果 keys17 确定，be 也确定）
  return { na, cookieK2, beLen, be };
}
const a = require('./nx_p1.json');
const b = require('./nx_p2.json');
console.log('P1 len:', a.P.length, 'P2 len:', b.P.length);
const ra = extractBaseFromP(a.P);
const rb = extractBaseFromP(b.P);
console.log('P1 na[0:8]:', ra.na.slice(0, 8).join(','));
console.log('P2 na[0:8]:', rb.na.slice(0, 8).join(','));
console.log('P1 cookieK2:', ra.cookieK2.slice(0, 8).join(','));
console.log('P2 cookieK2:', rb.cookieK2.slice(0, 8).join(','));
console.log('P1 beLen:', ra.beLen, 'P2 beLen:', rb.beLen);
console.log('P1 be[0:8]:', ra.be.slice(0, 8).join(','));
console.log('P2 be[0:8]:', rb.be.slice(0, 8).join(','));
console.log('\n★ cookieK2 (keys2) 相同?', JSON.stringify(ra.cookieK2) === JSON.stringify(rb.cookieK2));
console.log('★ be 相同?', JSON.stringify(ra.be) === JSON.stringify(rb.be));
console.log('★ beLen 相同?', ra.beLen === rb.beLen);
