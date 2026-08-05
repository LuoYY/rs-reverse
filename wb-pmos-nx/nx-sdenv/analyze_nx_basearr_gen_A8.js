// 方向 A8：修正 keys17 选择——dump 全部符合 shape 的 16B 候选，
// 逐个尝试解 be，找到能解出 179 头（权威 base179）的那个 keys17。
// 这样得到的 base179 才是服务器接受格式，才能做 cd 绑定 41B 分析。
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = '/tmp/nx_basearr_gen_A8.json';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function dB64(s) { const m = {}; for (let i = 0; i < 64; i++)m[NX_BS[i]] = i; const o = []; let q = 0; for (let g = 0; g < Math.floor(s.length / 4); g++) { const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]]; q += 4; if (c0 === undefined) return null; o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3) } const r = s.length - q; if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4)); else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2)); return o }
function getTree() { let a = []; for (let i = 1; i < 255; i++)a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) { if (it.total <= a[i].total) { a.splice(i, 0, it); return } } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const cm = {}; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!cm[c.val]) cm[c.val] = {}; cm[c.val][c.key] = b }
function hdec(bytes) { const ans = []; let cl = 0, ck = 0; for (const byte of bytes) { for (let bit = 7; bit >= 0; bit--) { ck = (ck << 1) | ((byte >> bit) & 1); cl++; const m = cm[cl]; if (m && m[ck] !== undefined) { ans.push(m[ck]); ck = 0; cl = 0 } } } return ans }
function henc(num) { const ans = []; let one = 0, two = 0; for (const b of num) { const cc = cfg[b]; if (!cc) continue; one = one << cc.val | cc.key; two += cc.val; while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8 } } if (two > 0) ans.push(one << 8 - two | 0x68 >> two); return ans }
function bestTrim(raw, huff) { const hh = huff.slice(0, huff.length - 1); for (let L = raw.length; L >= 1; L--) { const e = henc(raw.slice(0, L)); if (JSON.stringify(e.slice(0, e.length - 1)) === JSON.stringify(hh)) return raw.slice(0, L) } return raw }

(async () => {
  console.log('[A8] pid=%d start', process.pid);
  const captured = [];
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      const rec = (arr) => { if (captured.length >= 800) return; let a; try { a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null) } catch (e) { return } if (!a || (a.length !== 16 && a.length !== 48)) return; if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return; captured.push([...a]) };
      for (const C of [w.Array, w.Uint8Array]) { if (!C || !C.prototype) continue; for (const m of ['map', 'slice', 'concat', 'filter', 'flat', 'subarray']) { const o = C.prototype[m]; if (typeof o !== 'function') continue; try { C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r } } catch (e) { } } }
    },
  });
  const w = dom.window;
  const cookies = await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => { const c = dom.cookieJar.getCookieStringSync(B + '/'); const pLen = (c.match(/P=[^;]*/) || [''])[0].length; if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(c) } lastLen = pLen; if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(c) } }, 700);
  });
  let cdStr = null; try { cdStr = w.$_ts && w.$_ts.cd ? String(w.$_ts.cd) : null; } catch (e) { }
  // keys16（最高频 16B）+ cookie keys2
  const c16 = {}, c48 = {};
  for (const a of captured) { const k = a.join(','); if (a.length === 16) c16[k] = (c16[k] || 0) + 1; if (a.length === 48) c48[k] = (c48[k] || 0) + 1 }
  let k16 = null, mx = 0; for (const [k, v] of Object.entries(c16)) { if (v > mx) { mx = v; k16 = k.split(',').map(Number) } }
  // 全部 16B 候选（放宽：先试 shape，若 0 个则全部非 k16 的 16B 都试）
  let k17cands = [];
  for (const [k, v] of Object.entries(c16)) { const a = k.split(',').map(Number); if (k16 && JSON.stringify(a) === JSON.stringify(k16)) continue; const t8 = a.slice(8); if (t8[1] >= 128 && t8[4] >= 2 && t8[4] <= 7 && t8[6] >= 4 && t8[7] >= 2) k17cands.push({ a, cnt: v }); }
  if (k17cands.length === 0) {
    console.log('[A8] shape 候选=0，放宽为全部非k16的16B');
    for (const [k, v] of Object.entries(c16)) { const a = k.split(',').map(Number); if (k16 && JSON.stringify(a) === JSON.stringify(k16)) continue; k17cands.push({ a, cnt: v }); }
  }
  console.log('[A8] keys17 候选=', k17cands.length, 'c16 种类=', Object.keys(c16).length, 'cd?', !!cdStr);

  const P = cookies.split(';').map(s => s.trim()).find(p => /P=/.test(p)).split('=')[1];
  const k16a = numarrAddTime([...k16], 0, 1 / 256)[0];
  const dec = encryptMode2([...dB64(P.slice(1))], k16a, 1);
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  console.log('[A8] beLen=', beLen);

  // 逐个 keys17 候选解 be，找 179 头
  let winBase = null, winK17 = null;
  for (const c of k17cands) {
    try {
      const ka = numarrAddTime([...c.a], 0, 1 / 256)[0];
      const tmp = encryptMode2([...be], ka, 0);
      const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
      const base = bestTrim(hdec(huff), huff);
      const head = base.slice(0, 4).join(',');
      console.log('[A8] cand cnt=' + c.cnt + ' head=' + head + (head === '179,0,127,12' ? ' ★★★ 命中' : ''));
      if (head === '179,0,127,12' && !winBase) { winBase = base; winK17 = c.a; }
    } catch (e) { }
  }
  if (winBase) {
    console.log('[A8] ✓ 正确 keys17=', winK17.join(','));
    console.log('[A8] base.len=', winBase.length, 'sess[22:29]=', winBase.slice(22, 29).join(','), 'env73[68:73]=', winBase.slice(68, 73).join(','));
  } else {
    console.log('[A8] ✗ 无候选解出 179 头（keys17 可能不在 shape 候选里，或链路还有差异）');
  }
  fs.writeFileSync(OUT, JSON.stringify({ cd: cdStr, winBase, winK17, cookieK2, k16, candCount: k17cands.length }, null, 1));
  console.log('[A8] saved', OUT);
  dom.window.close(); console.log('[A8] done'); process.exit(0);
})().catch(e => { console.error('[A8] FATAL:', e && e.message); process.exit(1); });
