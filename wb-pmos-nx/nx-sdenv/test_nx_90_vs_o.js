// 分析 [90] = f(O)：采集含完整 O 的样本，对比 O 解码字节与 base[90]。
const path = require('path');
const fs = require('fs');
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
  console.log('[90] 分析 base[90] vs O');
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await nx.init({ timeout: 45000, log: () => {} });
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
    const oBytes = dB64(ctx.cookieO.split('=')[1]);
    samples.push({ O: ctx.cookieO.split('=')[1], oBytes, base, r2mka: ((na[2] << 24 | na[3] << 16 | na[4] << 8 | na[5]) >>> 0) });
    console.log('[90] #' + i + ' base[90]=' + base[90] + ' r2mka=' + samples[i].r2mka);
    await new Promise(r => setTimeout(r, 800));
  }
  fs.writeFileSync('/tmp/nx_90_o.json', JSON.stringify(samples, null, 1));
  // 分析
  for (let si = 0; si < samples.length; si++) {
    const s = samples[si];
    console.log('#+' + si + ' [90]=' + s.base[90] + ' O解码前24=' + s.oBytes.slice(0, 24).join(','));
    // 找 O 解码里 = [90] 的字节
    const idxs = [];
    for (let j = 0; j < s.oBytes.length; j++) if (s.oBytes[j] === s.base[90]) idxs.push(j);
    console.log('   O 解码中 [90] 值出现位置: ' + idxs.slice(0, 10).join(','));
  }
  process.exit(0);
})().catch(e => { console.error('[90] FATAL:', e && e.message); process.exit(1); });
