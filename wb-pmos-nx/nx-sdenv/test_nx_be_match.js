// 暴力搜索 ele（numarrAddTime 的 random 字节），使重构 be 与原 be 完全一致。
// 若找到 → 重构链路完全正确，验证 base 段自由性才有意义。
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
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const k17a = parser.numarrAddTime([...ctx.keys17], 0, 1 / 256)[0];
  const tmp = parser.encryptMode2([...be], k17a, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  const base = hdecRaw(huff);
  const r2mka = ((na[2] << 24 | na[3] << 16 | na[4] << 8 | na[5]) >>> 0);
  console.log('[BM] base.len=' + base.length + ' 头=' + base.slice(0, 8).join(',') + ' r2mka=' + r2mka);
  // 暴力搜 ele：numarrAddTime(keys17, r2mka, random)[0]，random 使 ele 变
  // numarrAddTime 里 ele = ceil(random * 256)。遍历 ele 0-255 等价于 random=ele/256
  const target = be;
  let found = null, best = null, bestMatch = 0;
  for (let ele = 0; ele < 256; ele++) {
    const random = ele / 256;
    const ka = parser.numarrAddTime([...ctx.keys17], r2mka, random)[0];
    const re = parser.encryptMode1(parser.xor(parser.numarrEncrypt(base), ctx.keys2, 16), ka, 0);
    const m = re.reduce((acc, v, i) => acc + (v === target[i] ? 1 : 0), 0);
    if (m > bestMatch) { bestMatch = m; best = ele; }
    if (eq(re, target)) { found = ele; break; }
  }
  console.log('[BM] best ele=' + best + ' 匹配 ' + bestMatch + '/' + target.length);
  if (found !== null) {
    console.log('[BM] ★ 找到 ele=' + found + ' 重构 be 完全一致！');
  } else {
    console.log('[BM] ✗ 无 ele 使 be 完全一致（base 或链路有差）');
  }
  process.exit(0);
})().catch(e => { console.error('[BM] FATAL:', e && e.message); process.exit(1); });
