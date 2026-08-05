// 验证瑞数 uuid：对比 cookie 内 uuid 字段与 CRC32(nextarr)。
// 若一致 → 瑞数 uuid=CRC32（项目一致），重构外层应可用。
// 若不一致 → 瑞数 uuid 是别的算法 → 重构 uuid 错 → 412 根因。
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
  const uuid4 = dec.slice(0, 4);
  const na = dec.slice(4);
  console.log('[UQ] cookie 内 uuid: ' + uuid4.join(','));
  // 项目 uuid (CRC32)
  const u32 = parser.uuid(na);
  console.log('[UQ] CRC32(na)      : ' + parser.numToNumarr4(u32).join(','));
  console.log('[UQ] 匹配?', JSON.stringify(uuid4) === JSON.stringify(parser.numToNumarr4(u32)));
  // 也试其他哈希
  const crypto = require('crypto');
  const crc2 = ((c) => { let v = 0 ^ -1; for (const b of c) v = v >>> 8 ^ parser.bignum ? 0 : 0; return v; });
  // MD5/SHA1 前4
  const md5 = crypto.createHash('md5').update(Buffer.from(na)).digest();
  console.log('[UQ] MD5 前4: ' + Array.from(md5.slice(0, 4)).join(','));
  const sha1 = crypto.createHash('sha1').update(Buffer.from(na)).digest();
  console.log('[UQ] SHA1 前4: ' + Array.from(sha1.slice(0, 4)).join(','));
  // 可能 uuid 是对 nextarr 字符串?
  const naStr = na.map(b => String.fromCharCode(b)).join('');
  const md5s = crypto.createHash('md5').update(naStr).digest();
  console.log('[UQ] MD5(字符串) 前4: ' + Array.from(md5s.slice(0, 4)).join(','));
  // 可能 uuid = CRC32 但 nextarr 含 uuid? 或用 numarr2string 后的字符串
  console.log('[UQ] na.len=' + na.length + ' na[0:8]=' + na.slice(0, 8).join(','));
  process.exit(0);
})().catch(e => { console.error('[UQ] FATAL:', e && e.message); process.exit(1); });
