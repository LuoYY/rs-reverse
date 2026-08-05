// sdenv 完整环境采集 base + keys：验证锚点固定性
const path = require('path');
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

function dB64(s) {
  const m = {};
  for (let i = 0; i < 64; i++) m[NX_BS[i]] = i;
  const o = [];
  let q = 0;
  for (let g = 0; g < Math.floor(s.length / 4); g++) {
    const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]];
    q += 4;
    if (c0 === undefined) return null;
    o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  return o;
}
function getTree() {
  let a = [];
  for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i });
  a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return; } a.push(it); }
  while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }); }
  return a[0];
}
function gEC(t, c = { key: 0, val: 0 }, arr = []) {
  if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr); } else arr[t.idx] = c;
  return arr;
}
const cfg = gEC(getTree());
const byLen = {};
let maxL = 0;
for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val; }
function hdecRaw(enc) {
  const ans = []; let key = 0, val = 0;
  for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const mm = byLen[val]; if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; } if (val > maxL) { key = 0; val = 0; } } }
  return ans;
}
function henc(num) {
  const ans = []; let one = 0, two = 0;
  for (const b of num) { const c = cfg[b]; if (!c) continue; one = one << c.val | c.key; two += c.val; while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; } }
  if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
  return ans;
}
function bestTrim(raw, huff) {
  const hh = huff.slice(0, huff.length - 1);
  for (let L = raw.length; L >= 1; L--) { const e = henc(raw.slice(0, L)); if (JSON.stringify(e.slice(0, e.length - 1)) === JSON.stringify(hh)) return raw.slice(0, L); }
  return raw;
}

// 从 sdenv cookie 解出 base + 从外层 VM 提取 keys
async function collectOne() {
  return new Promise((resolve) => {
    jsdomFromUrl(B + '/', {
      userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() },
    }).then((dom) => {
      setTimeout(() => {
        try {
          const c = dom.cookieJar.getCookieStringSync(B + '/');
          const Pval = (c.match(/P=([^;]*)/) || [])[1];
          const oVal = (c.match(/O=([^;]*)/) || [])[1];
          const w = dom.window;
          const nsd = w.$_ts ? w.$_ts.nsd : null;
          const cd = w.$_ts ? w.$_ts.cd : null;
          // 提取 keys：在外层 VM 执行时 hook 数组陷阱
          // 简化：先用已知的固定 keys16 解 base（keys17 需要）
          // 尝试：从 na 中直接解出（keys16 固定）
          const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
          const pBytes = dB64(Pval.slice(1));
          const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
          const dec = parser.encryptMode2([...pBytes], k16a, 1);
          const na = dec.slice(4);
          const cookieK2 = na.slice(11, 59);
          const beLen = (na[59] & 0x7f) << 8 | na[60];
          const be = na.slice(61, 61 + beLen);
          // keys17 未知 → 无法解 base，只返回 na 和 nsd
          dom.window.close();
          resolve({ nsd, cdLen: cd ? cd.length : 0, naHead: na.slice(0, 12), P: Pval ? Pval.slice(0, 8) : null, ok: true });
        } catch (e) {
          dom.window.close();
          resolve({ err: e.message, ok: false });
        }
      }, 9000);
    }).catch(e => resolve({ err: e.message, ok: false }));
  });
}

(async () => {
  for (let i = 0; i < 3; i++) {
    const s = await collectOne();
    console.log('[SA] #' + i + ':', JSON.stringify(s).substring(0, 200));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
