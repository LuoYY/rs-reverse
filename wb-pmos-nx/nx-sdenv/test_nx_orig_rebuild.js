// 用原样 be（sdenv 生成，不改字节）完整重构 cookie，验证重构外层链路。
// 若 200 → 重构链路完全正确，base 尾部差异是唯一障碍（服务器校验 base 尾部）。
// 若 412 → 重构外层有 bug。
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

(async () => {
  const ctx = await nx.init({ timeout: 50000, log: () => {} });
  const Pval = ctx.cookieP.split('=')[1];
  const pBytes = dB64(Pval.slice(1));
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = parser.encryptMode2([...pBytes], k16a, 1);
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const beOrig = na.slice(61, 61 + beLen);
  const r2mka = ((na[2] << 24 | na[3] << 16 | na[4] << 8 | na[5]) >>> 0);
  const startT = ((na[6] << 24 | na[7] << 16 | na[8] << 8 | na[9]) >>> 0);
  console.log('[RB] r2mka=' + r2mka + ' be.len=' + beOrig.length + ' na.len=' + na.length);
  // 用原样 be 完整重构 cookie。★ nx 结构：[4,8] 头 + 2B lenFlag
  const nextarr = [4, 8, ...parser.numToNumarr4(r2mka), ...parser.numToNumarr4(startT), 48, ...ctx.keys2, beOrig.length >> 8 & 255 | 128, beOrig.length & 255, ...beOrig];
  const runTime = r2mka;
  const random = Math.random();
  const cookie = 'a' + parser.numarr2string(
    parser.encryptMode1([...parser.numToNumarr4(parser.uuid(nextarr)), ...nextarr], parser.numarrAddTime([...K16], runTime, random)[0], 1, random),
    NX_BS.slice(0, 64).split('')
  );
  const { httpGet } = require('./proxy_http');
  const API = '/px-common-authcenter/auth/v2/captcha/get';
  // ★ O+P 配对 + 动态 cookie 名
  const Pname = ctx.cookieP.split('=')[0];
  const cookieFull = ctx.cookieO + '; ' + Pname + '=' + cookie;
  for (let i = 0; i < 2; i++) {
    const q = nx.genQuery(API, ctx.keys2, ctx.keys17);
    const rr = await httpGet(nx.TARGET + API, { userAgent: nx.UA, timeout: 20000, headers: { Cookie: cookieFull, Accept: '*/*', [nx.QUERY_PARAM]: q } });
    console.log('[RB] 原样 be 重构 #' + i + ' → ' + rr.status + (rr.error ? ' ' + rr.error : ''));
    await new Promise(r => setTimeout(r, 1500));
  }
  // 对照：原样 cookie
  for (let i = 0; i < 2; i++) {
    const q = nx.genQuery(API, ctx.keys2, ctx.keys17);
    const rr = await httpGet(nx.TARGET + API, { userAgent: nx.UA, timeout: 20000, headers: { Cookie: ctx.cookie, Accept: '*/*', [nx.QUERY_PARAM]: q } });
    console.log('[RB] 原样 cookie #' + i + ' → ' + rr.status + (rr.error ? ' ' + rr.error : ''));
    await new Promise(r => setTimeout(r, 1500));
  }
  process.exit(0);
})().catch(e => { console.error('[RB] FATAL:', e && e.message); process.exit(1); });
