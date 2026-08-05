// 采集 (r2mka, cd, base[90]) 样本，分析 [90] 会话字段 = f(r2mka/O/cd)。
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
const NX_BS2 = NX_BS;
function makeDk(bs) { return bs.split('').reduce((ans, key, idx) => { const cc = key.charCodeAt(); ans[0][cc] = idx << 2; ans[1][cc] = idx >> 4; ans[2][cc] = (idx & 15) << 4; ans[3][cc] = idx >> 2; ans[4][cc] = (idx & 3) << 6; ans[5][cc] = idx; return ans }, [{}, {}, {}, {}, {}, { ...new Array(256).fill(-1) }]) }
function decryptCd(cd) { const dk = makeDk(NX_BS2); const [d1, d2, d3, d4, d5, d6] = dk; const arr = []; for (let i = 0; i < cd.length; i += 4) { const one = cd[i].charCodeAt(), two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined, three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined, four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined; two !== undefined && arr.push(d1[one] | d2[two]); three !== undefined && arr.push(d3[two] | d4[three]); four !== undefined && arr.push(d5[three] | d6[four]) } return arr }
function gLG(n, idx) { const it = n[idx]; idx++; let l; if ((it & 128) === 0) l = it; else if ((it & 192) === 128) { l = ((it & 63) << 8) | n[idx]; idx++ } else if ((it & 224) === 192) { l = ((it & 31) << 16) | (n[idx] << 8) | n[idx + 1]; idx += 2 } else if ((it & 240) === 224) { l = ((it & 15) << 24) | (n[idx] << 16) | (n[idx + 1] << 8) | n[idx + 2]; idx += 3 } else if ((it & 248) === 240) { l = (n[idx] << 24) | (n[idx + 1] << 16) | (n[idx + 2] << 8) | n[idx + 3]; idx += 4 } else l = it; return [l, idx] }
function deriveKeys(cdArr) { const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); for (let k0 = 0; k0 <= 127; k0++)for (let k1 = 0; k1 <= 127; k1++) { const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48]; const ans = tail.map((b, j) => b ^ off[j % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; if (ans.some(v => v > 255)) continue; const keys = []; let op = 1, gap, ok = true; for (let j = 0; j < ans[0]; j++) { [gap, op] = gLG(ans, op); if (gap < 0 || op + gap > ans.length) { ok = false; break } keys.push(ans.slice(op, op + gap)); op += gap } if (!ok) continue; const k16 = keys[16]; if (k16 && k16.length === 16 && k16.every((v, j) => v === K16[j])) return { keys } } return null }

(async () => {
  const N = parseInt(process.argv[2] || '5', 10);
  console.log('[F9] 采集 ' + N + ' 个含 r2mka/cd 样本...');
  const samples = [];
  for (let i = 0; i < N; i++) {
    try {
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
      const r2mka = ((na[2] << 24 | na[3] << 16 | na[4] << 8 | na[5]) >>> 0);
      const start = ((na[6] << 24 | na[7] << 16 | na[8] << 8 | na[9]) >>> 0);
      samples.push({ nsd: ctx.nsd, r2mka, start, base, O: ctx.cookieO.split('=')[1].slice(0, 20) });
      console.log('[F9] #' + i + ' nsd=' + ctx.nsd + ' r2mka=' + r2mka + ' [90]=' + base[90] + ' [60]=' + base[60] + ' [65]=' + base[65]);
    } catch (e) { console.log('[F9] #' + i + ' ERR ' + e.message.slice(0, 50)); }
    await new Promise(r => setTimeout(r, 800));
  }
  fs.writeFileSync('/tmp/nx_field90_samples.json', JSON.stringify(samples, null, 1));
  console.log('[F9] saved /tmp/nx_field90_samples.json');
  // 分析 [90] vs r2mka
  if (samples.length >= 2) {
    console.log('\n=== [90] vs r2mka ===');
    samples.forEach((s, i) => {
      const r = s.r2mka;
      console.log('#' + i + ' r2mka=' + r + ' hex=' + (r & 255) + ',' + (r >>> 8 & 255) + ' [90]=' + s.base[90] + ' ([90]^r2mka低=' + (s.base[90] ^ (r & 255)) + ')');
    });
  }
  process.exit(0);
})().catch(e => { console.error('[F9] FATAL:', e && e.message); process.exit(1); });
