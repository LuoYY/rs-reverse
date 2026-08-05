// 全位置单字节扫描：每个位置 +1（若保持 huff 153 则测），找真实校验位。
// 若单字节改全 200（保持长度）→ base 内容自由（WAF 只校验 huff 长度 + TLV 结构）！
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
function buildCookie(base, keys2, keys17, r2mka, startT) {
  const random = Math.random();
  const basearrEncrypt = parser.encryptMode1(parser.xor(parser.numarrEncrypt(base), keys2, 16), parser.numarrAddTime([...keys17], r2mka, random)[0], 0);
  const nextarr = [4, 8, ...parser.numToNumarr4(r2mka), ...parser.numToNumarr4(startT), 48, ...keys2, basearrEncrypt.length >> 8 & 255 | 128, basearrEncrypt.length & 255, ...basearrEncrypt];
  return 'a' + parser.numarr2string(parser.encryptMode1([...parser.numToNumarr4(parser.uuid(nextarr)), ...nextarr], parser.numarrAddTime([...K16], r2mka, random)[0], 1, random), NX_BS.slice(0, 64).split(''));
}

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
  const huff = tmp.map((v, j) => j < 16 ? (v ^ cookieK2[j]) : v);
  const base = bestTrim(hdecRaw(huff), huff);
  const now = Math.floor(Date.now() / 1000);
  const baseHuff = henc(base).length;
  console.log('[SC] base.len=' + base.length + ' huffLen=' + baseHuff);
  const Pname = ctx.cookieP.split('=')[0];
  const API = '/px-common-authcenter/auth/v2/captcha/get';
  const { httpGet } = require('./proxy_http');
  const results = [];
  // 采样扫描：0,1,2,3,4,5,10,15,...,150
  const positions = [0, 1, 2, 3, 4, 5, 10, 15, 20, 23, 24, 25, 30, 35, 40, 45, 50, 55, 60, 65, 68, 70, 72, 73, 74, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 158, 159, 160];
  for (const i of positions) {
    if (i >= base.length) continue;
    // 尝试 +1 直到保持 huff 长度（最多 10 次）
    let b = [...base], changed = false;
    for (let t = 0; t < 10; t++) {
      const nb = [...base]; nb[i] = (b[i] + 1 + t) & 255;
      if (henc(nb).length === baseHuff) { b = nb; changed = true; break; }
    }
    if (!changed) { console.log('[SC] [' + i + '] 无法保持 huff 长度，跳过'); continue; }
    try {
      const pval = buildCookie(b, ctx.keys2, ctx.keys17, now, now + 1);
      const cf = ctx.cookieO + '; ' + Pname + '=' + pval;
      const q = nx.genQuery(API, ctx.keys2, ctx.keys17);
      const rr = await httpGet(nx.TARGET + API, { userAgent: nx.UA, timeout: 20000, headers: { Cookie: cf, Accept: '*/*', [nx.QUERY_PARAM]: q } });
      const st = rr.status;
      results.push([i, st]);
      console.log('[SC] [' + i + '] → ' + st);
    } catch (e) { console.log('[SC] [' + i + '] ERR'); }
    await new Promise(r => setTimeout(r, 1000));
  }
  const bad = results.filter(r => r[1] === 412);
  console.log('\n[SC] 412 位置: ' + bad.map(r => r[0]).join(','));
  process.exit(0);
})().catch(e => { console.error('[SC] FATAL:', e && e.message); process.exit(1); });
