// 方向 A9：修正 keys17——同一 $_ts(nsd,cd) 下：
//  (1) jsdomFromUrl 拉挑战页拿 nsd/cd + 跑外层 VM 拿 P cookie
//  (2) deriveKeysFromCd(cd) 派生正确 keys[17]（而非数组陷阱猜测）
//  (3) 用正确 keys17 解 be → 应得权威 base179（179 头）
// 这才是 cd 绑定 41B 分析的正确 base。根因：数组陷阱 shape 猜的 keys17 不可靠。
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
const OUT = '/tmp/nx_basearr_gen_A9.json';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

function dB64(s) { const m = {}; for (let i = 0; i < 64; i++)m[NX_BS[i]] = i; const o = []; let q = 0; for (let g = 0; g < Math.floor(s.length / 4); g++) { const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]]; q += 4; if (c0 === undefined) return null; o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3) } const r = s.length - q; if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4)); else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2)); return o }
function makeDk(bs) { return bs.split('').reduce((ans, key, idx) => { const c = key.charCodeAt(); ans[0][c] = idx << 2; ans[1][c] = idx >> 4; ans[2][c] = (idx & 15) << 4; ans[3][c] = idx >> 2; ans[4][c] = (idx & 3) << 6; ans[5][c] = idx; return ans }, [{}, {}, {}, {}, {}, { ...new Array(256).fill(-1) }]) }
function decryptCd(cd) { const dk = makeDk(NX_BS); const [d1, d2, d3, d4, d5, d6] = dk; const arr = []; for (let i = 0; i < cd.length; i += 4) { const one = cd[i].charCodeAt(); const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined; const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined; const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined; two !== undefined && arr.push(d1[one] | d2[two]); three !== undefined && arr.push(d3[two] | d4[three]); four !== undefined && arr.push(d5[three] | d6[four]) } return arr }
function gLG(n, idx) { const it = n[idx]; idx++; let l; if ((it & 128) === 0) l = it; else if ((it & 192) === 128) { l = ((it & 63) << 8) | n[idx]; idx++ } else if ((it & 224) === 192) { l = ((it & 31) << 16) | (n[idx] << 8) | n[idx + 1]; idx += 2 } else if ((it & 240) === 224) { l = ((it & 15) << 24) | (n[idx] << 16) | (n[idx + 1] << 8) | n[idx + 2]; idx += 3 } else if ((it & 248) === 240) { l = (n[idx] << 24) | (n[idx + 1] << 16) | (n[idx + 2] << 8) | n[idx + 3]; idx += 4 } else l = it; return [l, idx] }
function deriveKeys(cdArr) { const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); for (let k0 = 0; k0 <= 127; k0++)for (let k1 = 0; k1 <= 127; k1++) { const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48]; const ans = tail.map((b, i) => b ^ off[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; if (ans.some(v => v > 255)) continue; const keys = []; let op = 1, gap, ok = true; for (let i = 0; i < ans[0]; i++) { [gap, op] = gLG(ans, op); if (gap < 0 || op + gap > ans.length) { ok = false; break } keys.push(ans.slice(op, op + gap)); op += gap } if (!ok) continue; const k16 = keys[16]; if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { keys } } return null }
function getTree() { let a = []; for (let i = 1; i < 255; i++)a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) { if (it.total <= a[i].total) { a.splice(i, 0, it); return } } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const m = byLen[val]; if (m && m[key] !== undefined) { ans.push(m[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }
function henc(num) { const ans = []; let one = 0, two = 0; for (const b of num) { const c = cfg[b]; if (!c) continue; one = one << c.val | c.key; two += c.val; while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8 } } if (two > 0) ans.push(one << 8 - two | 0x68 >> two); return ans }
function bestTrim(raw, huff) { const hh = huff.slice(0, huff.length - 1); for (let L = raw.length; L >= 1; L--) { const e = henc(raw.slice(0, L)); if (JSON.stringify(e.slice(0, e.length - 1)) === JSON.stringify(hh)) return raw.slice(0, L) } return raw }

(async () => {
  console.log('[A9] pid=%d start', process.pid);
  const captured = [];
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      // 捕获 $_ts：轮询快照（VM 初始化时 $_ts.cd 存在，之后可能被清）
      let tsSnapshot = null;
      w.__snapTs = () => {
        try {
          const t = w.$_ts;
          if (t && t.cd && !tsSnapshot) { tsSnapshot = { nsd: t.nsd, cd: String(t.cd) }; return true; }
        } catch (e) { }
        return !!tsSnapshot;
      };
      w.__getTs = () => tsSnapshot || (w.$_ts && w.$_ts.cd ? { nsd: w.$_ts.nsd, cd: String(w.$_ts.cd) } : null);
      const rec = (arr) => { if (captured.length >= 600) return; let a; try { a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null) } catch (e) { return } if (!a || (a.length !== 16 && a.length !== 48)) return; if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return; captured.push([...a]) };
      for (const C of [w.Array, w.Uint8Array]) { if (!C || !C.prototype) continue; for (const m of ['map', 'slice', 'concat', 'filter', 'flat', 'subarray']) { const o = C.prototype[m]; if (typeof o !== 'function') continue; try { C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r } } catch (e) { } } }
    },
  });
  const w = dom.window;
  const cookies = await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => { try { w.__snapTs && w.__snapTs(); } catch (e) { } const c = dom.cookieJar.getCookieStringSync(B + '/'); const pLen = (c.match(/P=[^;]*/) || [''])[0].length; if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(c) } lastLen = pLen; if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(c) } }, 200);
  });
  let nsd = null, cdStr = null;
  try { const ts = w.__getTs && w.__getTs(); if (ts) { nsd = ts.nsd; cdStr = ts.cd ? String(ts.cd) : null; } } catch (e) { }
  console.log('[A9] nsd=', nsd, 'cd?', !!cdStr, 'cd.len=', cdStr ? cdStr.length : 0);
  if (!cdStr) { console.log('[A9] ✗ 未取到 cd，$_ts 可能已被清。FATAL'); process.exit(1); }

  // cd 派生正确 keys
  const der = deriveKeys(decryptCd(cdStr));
  console.log('[A9] deriveKeys?', !!der);
  if (!der) { console.log('[A9] ✗ cd 派生 keys 失败'); process.exit(1); }
  const keys17 = der.keys[17], keys2 = der.keys[2];
  console.log('[A9] keys[17]=', keys17.join(','));
  console.log('[A9] keys[2] 前8=', keys2.slice(0, 8).join(','));

  // cookie 权威 keys2
  const P = cookies.split(';').map(s => s.trim()).find(p => /P=/.test(p)).split('=')[1];
  const k16a = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...dB64(P.slice(1))], k16a, 1);
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  console.log('[A9] cd 派生 keys2 == cookie keys2?', JSON.stringify(keys2) === JSON.stringify(cookieK2));
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);

  // 用正确 keys17 解 be
  const k17a = numarrAddTime([...keys17], 0, 1 / 256)[0];
  const tmp = encryptMode2([...be], k17a, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  const base = bestTrim(hdecRaw(huff), huff);
  console.log('[A9] base.len=', base.length, 'head=', base.slice(0, 8).join(','));
  console.log('[A9] 匹配权威头 179,0,127,12?', base.slice(0, 4).join(',') === '179,0,127,12');
  console.log('[A9] sess[22:29]=', base.slice(22, 29).join(','));
  console.log('[A9] env73[68:73]=', base.slice(68, 73).join(','));
  console.log('[A9] var[110:137]=', base.slice(110, 137).join(','));

  fs.writeFileSync(OUT, JSON.stringify({ nsd, cd: cdStr, base, keys17, keys2, cookieK2, K16, be, P: P.slice(0, 60), beLen }, null, 1));
  console.log('[A9] saved', OUT);
  dom.window.close(); console.log('[A9] done'); process.exit(0);
})().catch(e => { console.error('[A9] FATAL:', e && e.message); process.exit(1); });
