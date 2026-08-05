// 决定性实验：本地 179 头 base（sdenv 本地固定 challenge）+ 真实 O/keys 重构 → API。
// 若 200 → 纯算法 = 本地 179 模板 + 真实 keys！（base 校验字段 = f(keys) 可生成）
// 若 412 → base 绑定 O/环境 → 需理解 f(O)。
const path = require('path');
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));
const nx = require('./nx_client');
const { jsdomFromUrl } = require('sdenv');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
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
// 本地 sdenv base
async function localBase() {
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: 'http://127.0.0.1:8080', consoleConfig: { error: new Function() } });
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  const c = dom.cookieJar.getCookieStringSync(B + '/');
  const Pval = (c.split(';').map(s => s.trim()).find(s => /P=/.test(s)) || '').split('=')[1];
  dom.window.close();
  return Pval;
}

(async () => {
  console.log('[LB] === 本地 base + 真实 keys 重构 ===');
  // 真实会话
  const ctx = await nx.init({ timeout: 50000, log: () => {} });
  console.log('[LB] 真实会话 nsd=' + ctx.nsd);
  // 本地 base（179头）
  const localP = await localBase();
  const pBytes = dB64(localP.slice(1));
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = parser.encryptMode2([...pBytes], k16a, 1);
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  // 本地 cd 派生 keys
  const html = fs.readFileSync('/tmp/nx_local_ch.html', 'utf8');
  const m = html.match(/\$_ts\.cd="([^"]+)"/);
  const NX_BS2 = NX_BS;
  function makeDk(bs) { return bs.split('').reduce((ans, key, idx) => { const cc = key.charCodeAt(); ans[0][cc] = idx << 2; ans[1][cc] = idx >> 4; ans[2][cc] = (idx & 15) << 4; ans[3][cc] = idx >> 2; ans[4][cc] = (idx & 3) << 6; ans[5][cc] = idx; return ans }, [{}, {}, {}, {}, {}, { ...new Array(256).fill(-1) }]) }
  function decryptCd(cd) { const dk = makeDk(NX_BS2); const [d1, d2, d3, d4, d5, d6] = dk; const arr = []; for (let i = 0; i < cd.length; i += 4) { const one = cd[i].charCodeAt(), two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined, three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined, four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined; two !== undefined && arr.push(d1[one] | d2[two]); three !== undefined && arr.push(d3[two] | d4[three]); four !== undefined && arr.push(d5[three] | d6[four]) } return arr }
  function gLG(n, idx) { const it = n[idx]; idx++; let l; if ((it & 128) === 0) l = it; else if ((it & 192) === 128) { l = ((it & 63) << 8) | n[idx]; idx++ } else if ((it & 224) === 192) { l = ((it & 31) << 16) | (n[idx] << 8) | n[idx + 1]; idx += 2 } else if ((it & 240) === 224) { l = ((it & 15) << 24) | (n[idx] << 16) | (n[idx + 1] << 8) | n[idx + 2]; idx += 3 } else if ((it & 248) === 240) { l = (n[idx] << 24) | (n[idx + 1] << 16) | (n[idx + 2] << 8) | n[idx + 3]; idx += 4 } else l = it; return [l, idx] }
  function deriveKeys(cdArr) { const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); for (let k0 = 0; k0 <= 127; k0++)for (let k1 = 0; k1 <= 127; k1++) { const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48]; const ans = tail.map((b, j) => b ^ off[j % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; if (ans.some(v => v > 255)) continue; const keys = []; let op = 1, gap, ok = true; for (let j = 0; j < ans[0]; j++) { [gap, op] = gLG(ans, op); if (gap < 0 || op + gap > ans.length) { ok = false; break } keys.push(ans.slice(op, op + gap)); op += gap } if (!ok) continue; const k16 = keys[16]; if (k16 && k16.length === 16 && k16.every((v, j) => v === K16[j])) return { keys } } return null }
  const der = deriveKeys(decryptCd(m[1]));
  const k17a = parser.numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
  const tmp = parser.encryptMode2([...be], k17a, 0);
  const huff = tmp.map((v, j) => j < 16 ? (v ^ cookieK2[j]) : v);
  const localBaseArr = bestTrim(hdecRaw(huff), huff);
  console.log('[LB] 本地 base.len=' + localBaseArr.length + ' 头=' + localBaseArr.slice(0, 8).join(','));
  // 用真实 keys + 真实 O 重构
  const Pname = ctx.cookieP.split('=')[0];
  const API = '/px-common-authcenter/auth/v2/captcha/get';
  const { httpGet } = require('./proxy_http');
  const now = Math.floor(Date.now() / 1000);
  const pval = buildCookie(localBaseArr, ctx.keys2, ctx.keys17, now, now + 1);
  const cf = ctx.cookieO + '; ' + Pname + '=' + pval;
  const q = nx.genQuery(API, ctx.keys2, ctx.keys17);
  const rr = await httpGet(nx.TARGET + API, { userAgent: nx.UA, timeout: 20000, headers: { Cookie: cf, Accept: '*/*', [nx.QUERY_PARAM]: q } });
  console.log('[LB] 本地base+真实O+真实keys → ' + rr.status + (rr.error ? ' ' + rr.error : ''));
  // 对照：真实 base
  const pBytes2 = dB64(ctx.cookieP.split('=')[1].slice(1));
  const dec2 = parser.encryptMode2([...pBytes2], k16a, 1);
  const na2 = dec2.slice(4);
  const beLen2 = (na2[59] & 0x7f) << 8 | na2[60];
  const be2 = na2.slice(61, 61 + beLen2);
  const k17a2 = parser.numarrAddTime([...ctx.keys17], 0, 1 / 256)[0];
  const tmp2 = parser.encryptMode2([...be2], k17a2, 0);
  const huff2 = tmp2.map((v, j) => j < 16 ? (v ^ na2.slice(11, 59)[j]) : v);
  const realBase = bestTrim(hdecRaw(huff2), huff2);
  const pval2 = buildCookie(realBase, ctx.keys2, ctx.keys17, now, now + 1);
  const cf2 = ctx.cookieO + '; ' + Pname + '=' + pval2;
  const q2 = nx.genQuery(API, ctx.keys2, ctx.keys17);
  const rr2 = await httpGet(nx.TARGET + API, { userAgent: nx.UA, timeout: 20000, headers: { Cookie: cf2, Accept: '*/*', [nx.QUERY_PARAM]: q2 } });
  console.log('[LB] 真实base+真实O+真实keys → ' + rr2.status + (rr2.error ? ' ' + rr2.error : ''));
  process.exit(0);
})().catch(e => { console.error('[LB] FATAL:', e && e.message); process.exit(1); });
