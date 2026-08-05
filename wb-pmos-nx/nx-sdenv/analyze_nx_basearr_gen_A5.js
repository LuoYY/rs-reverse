// 方向 A5：sdenv 端到端——直接解 P cookie 得到 base179（B 侧骨架域），
// 同时用数组陷阱抓"明文"（170B, 113 头）。对照验证两层 basearr 的关系，
// 并把 base179 落到段骨架，锁定 cd 绑定 41B 的实际字节。
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const crypto = require('crypto');
// 用瑞数 encryptMode2（非 AES-CBC）解 be
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = '/tmp/nx_basearr_gen_A5.json';

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decodeB64(str) {
  const idx = {}; for (let i = 0; i < 64; i++) idx[NX_BS[i]] = i;
  const out = []; let q = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idx[str[q]], c1 = idx[str[q + 1]], c2 = idx[str[q + 2]], c3 = idx[str[q + 3]]; q += 4;
    if (c0 === undefined) return null;
    out.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - q;
  if (rem === 2) out.push((idx[str[q]] << 2) | (idx[str[q + 1]] >> 4));
  else if (rem === 3) out.push((idx[str[q]] << 2) | (idx[str[q + 1]] >> 4), ((idx[str[q + 1]] & 15) << 4) | (idx[str[q + 2]] >> 2));
  return out;
}
function aesDec(data, key, iv) { const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(iv)); d.setAutoPadding(false); return [...d.update(Buffer.from(data)), ...d.final()]; }
function getTree() { let a = []; for (let i = 1; i < 255; i++)a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) { if (it.total <= a[i].total) { a.splice(i, 0, it); return } } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const encCfg = gEC(getTree());
const codeMap = {}; for (let b = 0; b < 256; b++) { const c = encCfg[b]; if (!c) continue; if (!codeMap[c.val]) codeMap[c.val] = {}; codeMap[c.val][c.key] = b; }
function huffDec(bytes) { const ans = []; let cl = 0, ck = 0; for (const byte of bytes) { for (let bit = 7; bit >= 0; bit--) { ck = (ck << 1) | ((byte >> bit) & 1); cl++; const m = codeMap[cl]; if (m && m[ck] !== undefined) { ans.push(m[ck]); ck = 0; cl = 0 } } } return ans }
function huffEncTrim(num) { const ans = []; let one = 0, two = 0; for (const b of num) { const cc = encCfg[b]; if (!cc) continue; one = one << cc.val | cc.key; two += cc.val; while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8 } } if (two > 0) ans.push(one << 8 - two | 0x68 >> two); return ans }

(async () => {
  console.log('[A5] pid=%d start %s', process.pid, new Date().toISOString());
  const captured = [];
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      const rec = (arr, src) => { if (captured.length >= 600) return; let a; try { a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null) } catch (e) { return } if (!a || !a.length) return; if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return; captured.push({ src, len: a.length, data: [...a] }) };
      for (const C of [w.Array, w.Uint8Array]) { if (!C || !C.prototype) continue; for (const m of ['map', 'slice', 'concat', 'filter', 'flat', 'subarray', 'fill']) { const o = C.prototype[m]; if (typeof o !== 'function') continue; try { C.prototype[m] = function () { const r = o.apply(this, arguments); rec(m === 'fill' ? this : r, C.name + '.' + m); return r } } catch (e) { } } }
    },
  });
  const cookies = await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => { const c = dom.cookieJar.getCookieStringSync(B + '/'); const pLen = (c.match(/P=[^;]*/) || [''])[0].length; if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(c) } lastLen = pLen; if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(c) } }, 700);
  });
  // 抓 cd（$_ts）
  const w = dom.window;
  let cdStr = null;
  try { cdStr = w.$_ts && w.$_ts.cd ? String(w.$_ts.cd) : null; } catch (e) {}
  // keys 陷阱识别
  const c16 = {}, c48 = {};
  for (const e of captured) { const k = e.data.join(','); if (e.data.length === 16) c16[k] = (c16[k] || 0) + 1; if (e.data.length === 48) c48[k] = (c48[k] || 0) + 1; }
  let k16 = null, mx = 0; for (const [k, v] of Object.entries(c16)) { if (v > mx) { mx = v; k16 = k.split(',').map(Number) } }
  let k17 = null; for (const [k] of Object.entries(c16)) { const a = k.split(',').map(Number); if (k16 && JSON.stringify(a) === JSON.stringify(k16)) continue; const t8 = a.slice(8); if (t8[1] >= 128 && t8[4] >= 2 && t8[4] <= 7 && t8[6] >= 4 && t8[7] >= 2) { k17 = a; break } }
  let k2 = null, mx48 = 0; for (const [k, v] of Object.entries(c48)) { if (v > mx48) { mx48 = v; k2 = k.split(',').map(Number) } }
  console.log('[A5] k16?', !!k16, 'k17?', !!k17, 'k2?', !!k2);

  // 解 P cookie → base179
  const P = cookies.split(';').map(s => s.trim()).find(p => /P=/.test(p)).split('=')[1];
  const bytes = decodeB64(P.startsWith('a') ? P.slice(1) : P);
  // 瑞数管线：encryptMode2(keys16+time, flag=1) 解出 [uuid4 | nextarr]，encryptMode2 自动去尾
  const k16arr = numarrAddTime([...k16], 0, 1 / 256)[0];
  const dec = encryptMode2([...bytes], k16arr, 1);
  const nextarr = dec.slice(4);
  let idx = 2 + 8; const k2len = nextarr[idx]; idx++; const cookieK2 = nextarr.slice(idx, idx + k2len); idx += k2len;
  const rest = nextarr.slice(idx);
  let be; if ((rest[0] & 0x80) === 0x80) { const l = rest[1] | ((rest[0] & 0x7f) << 8); be = rest.slice(2, 2 + l) } else { be = rest.slice(1, 1 + rest[0]) }
  console.log('[A5] be(basearrEnc) len=', be.length);
  // 瑞数管线：be → encryptMode2(keys17+time) → 前16 XOR keys2 → huffman 解码 → 去尾对齐
  const k17arr = numarrAddTime([...k17], 0, 1 / 256)[0];
  const tmp = encryptMode2([...be], k17arr, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  // 去尾对齐：找最大 L 使 huffEnc(raw[0:L]) 前缀 == huff[0:len-1]
  const raw = huffDec(huff);
  let bestLen = 0;
  const huffHead = huff.slice(0, huff.length - 1);
  for (let L = raw.length; L >= 1; L--) {
    const enc = huffEncTrim(raw.slice(0, L));
    if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
  }
  const base179 = raw.slice(0, bestLen);
  console.log('[A5] base179 len=', base179.length, 'head=', base179.slice(0, 24).join(','));

  // 段骨架落位（B 侧）
  const seg = {
    fixedHead_0_22: base179.slice(0, 22),
    sess_22_29: base179.slice(22, 29),      // cd 绑定
    fp_29_68: base179.slice(29, 68),
    env73_68_73: base179.slice(68, 73),     // cd 绑定
    free_73_110: base179.slice(73, 110),
    var_110_137: base179.slice(110, 137),   // 环境/cd
    fixedTail_137: base179.slice(137),
  };
  console.log('[A5] sess[22:29]=', seg.sess_22_29.join(','));
  console.log('[A5] env73[68:73]=', seg.env73_68_73.join(','));
  console.log('[A5] var[110:137]=', seg.var_110_137.join(','));

  // 明文候选（170B 113 头）
  const plain170 = captured.filter(e => e.len === 170 && e.data[0] === 113);
  console.log('[A5] plain170 候选=', plain170.length);

  fs.writeFileSync(OUT, JSON.stringify({ cd: cdStr, base179, seg, cookieK2, k16, k17, be, plain170: plain170.map(e => e.data) }, null, 1));
  console.log('[A5] saved %s', OUT);
  dom.window.close(); console.log('[A5] done'); process.exit(0);
})().catch(e => { console.error('[A5] FATAL:', e && e.message, e && e.stack); process.exit(1); });
