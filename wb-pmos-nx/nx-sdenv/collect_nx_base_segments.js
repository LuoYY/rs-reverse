// 采集多个 sdenv 会话的 base 绑定段（[22:44]+[73:148]），找生成公式。
// 同环境（sdenv 固定）不同 cd → 绑定段变化 → 分析是否 f(cd) 或 f(时间/计数器)。
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

async function collect(idx) {
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
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  const base = bestTrim(hdecRaw(huff), huff);
  const r2mka = ((na[2] << 24 | na[3] << 16 | na[4] << 8 | na[5]) >>> 0);
  return { nsd: ctx.nsd, r2mka, base, keys2: ctx.keys2, keys17: ctx.keys17 };
}

(async () => {
  const N = parseInt(process.argv[2] || '5', 10);
  console.log('[CS] 采集 ' + N + ' 个会话...');
  const samples = [];
  for (let i = 0; i < N; i++) {
    try {
      const s = await collect(i);
      samples.push(s);
      console.log('[CS] #' + i + ' nsd=' + s.nsd + ' base.len=' + s.base.length + ' r2mka=' + s.r2mka);
      console.log('[CS]   [22:44]: ' + s.base.slice(22, 44).join(','));
      console.log('[CS]   [73:90]: ' + s.base.slice(73, 90).join(','));
    } catch (e) { console.log('[CS] #' + i + ' ERR ' + e.message.slice(0, 60)); }
    await new Promise(r => setTimeout(r, 1000));
  }
  fs.writeFileSync('/tmp/nx_base_segments.json', JSON.stringify(samples, null, 1));
  console.log('[CS] saved /tmp/nx_base_segments.json');
  // 分析：对比绑定段变化与 r2mka 时间
  if (samples.length >= 2) {
    console.log('\n=== 绑定段变化分析 ===');
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      const dt = b.r2mka - a.r2mka;
      const segA = a.base.slice(22, 44), segB = b.base.slice(22, 44);
      const x = segA.map((v, j) => v ^ segB[j]);
      console.log('#(' + (i - 1) + '→' + i + ') dt=' + dt + 's [22:44]^[22:44]=' + x.join(','));
      const tA = a.base.slice(73, 90), tB = b.base.slice(73, 90);
      console.log('   [73:90]^[73:90]=' + tA.map((v, j) => v ^ tB[j]).join(','));
    }
  }
  process.exit(0);
})().catch(e => { console.error('[CS] FATAL:', e && e.message); process.exit(1); });
