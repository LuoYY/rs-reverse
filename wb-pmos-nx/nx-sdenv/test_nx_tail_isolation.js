// 隔离测试：从 sdenv 原样 cookie 解出 be，只替换 be 尾部 16B（用重构值），
// 其他字段（r2mka/start/keys2/be头部）保持原样 → 重构完整 cookie → API。
// 若 412 → be 尾部（base 尾部动态段）被服务器精确校验（必须内层 VM 生成）。
// 若 200 → be 尾部可自由，412 是重构其他 bug。
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
  const k17a = parser.numarrAddTime([...ctx.keys17], 0, 1 / 256)[0];
  const tmp = parser.encryptMode2([...beOrig], k17a, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  const base = hdecRaw(huff);
  console.log('[TI] base.len=' + base.length + ' be.len=' + beOrig.length + ' r2mka=' + r2mka);
  // 用 ele=0 重构 be（前 144 匹配）
  const ka0 = parser.numarrAddTime([...ctx.keys17], r2mka, 0)[0];
  const beRe = parser.encryptMode1(parser.xor(parser.numarrEncrypt(base), ctx.keys2, 16), ka0, 0);
  console.log('[TI] be 重构尾部16:', beRe.slice(144).join(','));
  console.log('[TI] 原 be 尾部16: ', beOrig.slice(144).join(','));
  // 变体 1：be = 原样 + 重构尾部（只改尾部）
  const beV1 = [...beOrig.slice(0, 144), ...beRe.slice(144)];
  // 变体 2：be 全用重构
  const beV2 = beRe;
  const api = async (be, label) => {
    const nextarr = parser.numarrJoin(parser.numarrJoin(2, parser.numToNumarr4([r2mka, startT]), ctx.keys2), be.length >> 8 & 255 | 128, be);
    const runTime = Math.floor(Date.now() / 1000);
    const random = Math.random();
    const cookie = 'a' + parser.numarr2string(
      parser.encryptMode1([...parser.numToNumarr4(parser.uuid(nextarr)), ...nextarr], parser.numarrAddTime([...K16], runTime, random)[0], 1, random),
      NX_BS.slice(0, 64).split('')
    );
    const { httpGet } = require('./proxy_http');
    const API = '/px-common-authcenter/auth/v2/captcha/get';
    const q = nx.genQuery(API, ctx.keys2, ctx.keys17);
    const rr = await httpGet(nx.TARGET + API, { userAgent: nx.UA, timeout: 20000, headers: { Cookie: cookie, Accept: '*/*', [nx.QUERY_PARAM]: q } });
    console.log('[TI] ' + label + ' → ' + rr.status + (rr.error ? ' ' + rr.error : ''));
  };
  await api(beV1, '原样+重构尾部');
  await new Promise(r => setTimeout(r, 1500));
  await api(beV2, '全重构');
  process.exit(0);
})().catch(e => { console.error('[TI] FATAL:', e && e.message); process.exit(1); });
