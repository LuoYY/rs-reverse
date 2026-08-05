// ★★★ 终极验证：纯算法 base 生成方案 ★★★
// 用历史样本 base 作为模板（[60][65] 环境编码模板），[90] 改为宽松值 1，
// + 新会话 keys/O 重构 → 测 200？
// 若 200 → 纯算法达成：base = 模板 + [90]=宽松值 + 自由字段随机（保持 huff 153）！
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
function buildCookie(base, keys2, keys17, r2mka, startT) {
  const random = Math.random();
  const basearrEncrypt = parser.encryptMode1(parser.xor(parser.numarrEncrypt(base), keys2, 16), parser.numarrAddTime([...keys17], r2mka, random)[0], 0);
  const nextarr = [4, 8, ...parser.numToNumarr4(r2mka), ...parser.numToNumarr4(startT), 48, ...keys2, basearrEncrypt.length >> 8 & 255 | 128, basearrEncrypt.length & 255, ...basearrEncrypt];
  return 'a' + parser.numarr2string(parser.encryptMode1([...parser.numToNumarr4(parser.uuid(nextarr)), ...nextarr], parser.numarrAddTime([...K16], r2mka, random)[0], 1, random), NX_BS.slice(0, 64).split(''));
}

(async () => {
  console.log('[FP] === 纯算法 base 终极验证 ===');
  // 历史样本模板
  const samples = JSON.parse(fs.readFileSync('/tmp/nx_o_base_pairs.json', 'utf8'));
  const tpl = [...samples[0].base];
  console.log('[FP] 模板 base.len=' + tpl.length + ' huff=' + henc(tpl).length + ' [60]=' + tpl[60] + ' [65]=' + tpl[65]);
  // 新会话
  const ctx = await nx.init({ timeout: 50000, log: () => {} });
  console.log('[FP] 新会话 nsd=' + ctx.nsd);
  const now = Math.floor(Date.now() / 1000);
  const Pname = ctx.cookieP.split('=')[0];
  const API = '/px-common-authcenter/auth/v2/captcha/get';
  const { httpGet } = require('./proxy_http');
  const baseHuff = henc(tpl).length;
  const testOne = async (name, base) => {
    try {
      const h1 = henc(base).length;
      const pval = buildCookie(base, ctx.keys2, ctx.keys17, now, now + 1);
      const cf = ctx.cookieO + '; ' + Pname + '=' + pval;
      const q = nx.genQuery(API, ctx.keys2, ctx.keys17);
      const rr = await httpGet(nx.TARGET + API, { userAgent: nx.UA, timeout: 20000, headers: { Cookie: cf, Accept: '*/*', [nx.QUERY_PARAM]: q } });
      console.log('[FP] ' + name + ' (huff=' + h1 + ') → ' + rr.status + (rr.error ? ' ' + rr.error : ''));
    } catch (e) { console.log('[FP] ' + name + ' → ERR ' + e.message.slice(0, 40)); }
    await new Promise(r => setTimeout(r, 1500));
  };
  // 变体1：模板 + [90]=1（宽松值）
  {
    const b = [...tpl]; b[90] = 1;
    console.log('[FP] 变体1 [90]=1');
    await testOne('模板+[90]=1', b);
  }
  // 变体2：模板 + [90]=1 + 中间段自由字段随机（保持 huff）
  {
    const b = [...tpl]; b[90] = 1;
    for (let i = 70; i < b.length; i++) {
      // 用 huffman 同长度替换（部分位置）
      const c = cfg[b[i]];
      if (i % 3 === 0 && c && byLen[c.val]) {
        const keys = Object.keys(byLen[c.val]);
        if (keys.length > 1) b[i] = parseInt(keys[0]);
      }
    }
    console.log('[FP] 变体2 [90]=1+中间段随机');
    await testOne('模板+[90]=1+随机', b);
  }
  process.exit(0);
})().catch(e => { console.error('[FP] FATAL:', e && e.message); process.exit(1); });
