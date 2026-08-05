// 决定性实验：base 动态段自由性测试。
// sdenv 生成实时 cookie → 解出 base → 分别测试：
//   原样 / 改[22:44]随机 / 改[73:148]随机 / 改[44:72]稳定段 → 重构 cookie → API 实测
// 若动态段可改 → 纯算法 base = 模板 + 随机动态段！
const fs = require('fs');
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
function makeDk(bs) { return bs.split('').reduce((ans, key, idx) => { const c = key.charCodeAt(); ans[0][c] = idx << 2; ans[1][c] = idx >> 4; ans[2][c] = (idx & 15) << 4; ans[3][c] = idx >> 2; ans[4][c] = (idx & 3) << 6; ans[5][c] = idx; return ans }, [{}, {}, {}, {}, {}, { ...new Array(256).fill(-1) }]) }
function decryptCd(cd) { const dk = makeDk(NX_BS); const [d1, d2, d3, d4, d5, d6] = dk; const arr = []; for (let i = 0; i < cd.length; i += 4) { const one = cd[i].charCodeAt(); const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined; const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined; const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined; two !== undefined && arr.push(d1[one] | d2[two]); three !== undefined && arr.push(d3[two] | d4[three]); four !== undefined && arr.push(d5[three] | d6[four]) } return arr }
function gLG(n, idx) { const it = n[idx]; idx++; let l; if ((it & 128) === 0) l = it; else if ((it & 192) === 128) { l = ((it & 63) << 8) | n[idx]; idx++ } else if ((it & 224) === 192) { l = ((it & 31) << 16) | (n[idx] << 8) | n[idx + 1]; idx += 2 } else if ((it & 240) === 224) { l = ((it & 15) << 24) | (n[idx] << 16) | (n[idx + 1] << 8) | n[idx + 2]; idx += 3 } else if ((it & 248) === 240) { l = (n[idx] << 24) | (n[idx + 1] << 16) | (n[idx + 2] << 8) | n[idx + 3]; idx += 4 } else l = it; return [l, idx] }
function deriveKeys(cdArr) { const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); for (let k0 = 0; k0 <= 127; k0++)for (let k1 = 0; k1 <= 127; k1++) { const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48]; const ans = tail.map((b, i) => b ^ off[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; if (ans.some(v => v > 255)) continue; const keys = []; let op = 1, gap, ok = true; for (let i = 0; i < ans[0]; i++) { [gap, op] = gLG(ans, op); if (gap < 0 || op + gap > ans.length) { ok = false; break } keys.push(ans.slice(op, op + gap)); op += gap } if (!ok) continue; const k16 = keys[16]; if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { keys } } return null }
function getTree() { let a = []; for (let i = 1; i < 255; i++)a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) { if (it.total <= a[i].total) { a.splice(i, 0, it); return } } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const m = byLen[val]; if (m && m[key] !== undefined) { ans.push(m[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }

// 从 P cookie 解 base
function baseFromP(P, cd) {
  const der = deriveKeys(decryptCd(cd));
  if (!der) return null;
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = parser.encryptMode2([...dB64(P.slice(1))], k16a, 1);
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const k17a = parser.numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
  const tmp = parser.encryptMode2([...be], k17a, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  return { base: hdecRaw(huff), na, cookieK2, keys2: der.keys[2], keys17: der.keys[17], beLen };
}

// 用项目管线重构 cookie（给定 base）。★ nx 结构：nextarr=[4,8,r2mka,start,48,keys2,2B lenFlag,be]
function buildCookie(base, keys2, keys17, r2mkaTime, startTime) {
  const runTime = r2mkaTime; // 外层 time 用 r2mka（nx 约定）
  const random = Math.random();
  const basearrEncrypt = parser.encryptMode1(
    parser.xor(parser.numarrEncrypt(base), keys2, 16),
    parser.numarrAddTime([...keys17], runTime, random)[0],
    0
  );
  const nextarr = [4, 8, ...parser.numToNumarr4(r2mkaTime), ...parser.numToNumarr4(startTime), 48, ...keys2,
    basearrEncrypt.length >> 8 & 255 | 128, basearrEncrypt.length & 255, ...basearrEncrypt];
  const cookie = 'a' + parser.numarr2string(
    parser.encryptMode1(
      [...parser.numToNumarr4(parser.uuid(nextarr)), ...nextarr],
      parser.numarrAddTime([...K16], runTime, random)[0],
      1, random
    ),
    NX_BS.slice(0, 64).split('')
  );
  return cookie;
}

(async () => {
  console.log('[FRE] pid=%d 启动', process.pid);
  console.log('[FRE] 初始化 sdenv（真实代理）...');
  const ctx = await nx.init({ timeout: 50000, log: (m) => console.log('  ' + m) });
  console.log('[FRE] cookie 获取成功, nsd=' + ctx.nsd);
  // 解 base（keys 从 ctx 拿，无需 cd）。cookie 名动态如 3RKyaeh47p90P=xxx，值以 'a' 开头
  const P = ctx.cookieP.split('=')[1];
  const pBytes = dB64(P.slice(1));
  console.log('[FRE] P.len=' + P.length + ' P 解码字节=' + (pBytes ? pBytes.length : 'null'));
  if (!pBytes) { console.log('[FRE] ✗ P 解码失败'); process.exit(1); }
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = parser.encryptMode2([...pBytes], k16a, 1);
  const na = dec.slice(4);
  console.log('[FRE] na.len=' + na.length + ' na[0:4]=' + na.slice(0, 4).join(',') + ' na[59]=' + na[59] + ' na[60]=' + na[60]);
  const cookieK2 = na.slice(11, 59);
  const k2match = JSON.stringify(ctx.keys2) === JSON.stringify(cookieK2);
  console.log('[FRE] keys2 匹配 cookie?', k2match);
  if (!k2match) { console.log('[FRE] ✗ keys 不匹配，中止'); process.exit(1); }
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  console.log('[FRE] beLen=' + beLen + ' be.len=' + be.length + ' be[0:8]=' + be.slice(0, 8).join(','));
  const k17a = parser.numarrAddTime([...ctx.keys17], 0, 1 / 256)[0];
  const tmp = parser.encryptMode2([...be], k17a, 0);
  console.log('[FRE] tmp.len=' + tmp.length);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  const base = hdecRaw(huff);
  console.log('[FRE] base.len=' + base.length + ' 头=' + base.slice(0, 8).join(','));
  // r2mkaTime/startTime 从 na 解
  const r2mka = ((na[2] << 24 | na[3] << 16 | na[4] << 8 | na[5]) >>> 0);
  const startT = ((na[6] << 24 | na[7] << 16 | na[8] << 8 | na[9]) >>> 0);
  console.log('[FRE] r2mka=' + r2mka + ' start=' + startT);
  // 变体测试
  const variants = {
    '原样': base,
    '改[22:44]随机': (() => { const b = [...base]; for (let i = 22; i < 44; i++) b[i] = Math.floor(Math.random() * 256); return b; })(),
    '改[73:148]随机': (() => { const b = [...base]; for (let i = 73; i < Math.min(b.length, 148); i++) b[i] = Math.floor(Math.random() * 256); return b; })(),
    '改[44:72]随机(稳定段)': (() => { const b = [...base]; for (let i = 44; i < 72; i++) b[i] = Math.floor(Math.random() * 256); return b; })(),
  };
  const API = '/px-common-authcenter/auth/v2/captcha/get';
  const Pname = ctx.cookieP.split('=')[0];
  for (const [name, b] of Object.entries(variants)) {
    try {
      const pval = buildCookie(b, ctx.keys2, ctx.keys17, r2mka, startT);
      const cookieFull = ctx.cookieO + '; ' + Pname + '=' + pval;
      const q = nx.genQuery(API, ctx.keys2, ctx.keys17);
      const { httpGet } = require('./proxy_http');
      const rr = await httpGet(nx.TARGET + API, {
        userAgent: nx.UA, timeout: 20000,
        headers: { Cookie: cookieFull, Accept: '*/*', [nx.QUERY_PARAM]: q },
      });
      console.log('[FRE] ' + name + ' → status=' + rr.status + (rr.error ? ' err=' + rr.error : ''));
    } catch (e) { console.log('[FRE] ' + name + ' → ERR ' + e.message.slice(0, 60)); }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('[FRE] done');
  process.exit(0);
})().catch(e => { console.error('[FRE] FATAL:', e && e.message); process.exit(1); });
