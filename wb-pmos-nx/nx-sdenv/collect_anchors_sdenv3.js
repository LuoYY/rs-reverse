// sdenv 完整环境提取 keys + base：遍历 16B 候选找 keys17
const path = require('path');
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = process.env.NX_SDENV_PROXY || 'http://ericshi:583315@120.221.249.98:2018';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

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

async function collectOne(idx) {
  return new Promise((resolve) => {
    const found = [];
    const rec = (arr) => {
      if (!arr || typeof arr !== 'object') return;
      const a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null);
      if (!a) return;
      if (a.length !== 16 && a.length !== 48) return;
      if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
      if (found.length < 200) found.push([...a]);
    };
    jsdomFromUrl(B + '/', {
      userAgent: UA, proxy: SDENV_PROXY,
      consoleConfig: { error: new Function() },
      beforeParse(window) {
        for (const C of [window.Array, window.Uint8Array]) {
          if (!C) continue;
          for (const mm of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
            const o = C.prototype[mm];
            if (typeof o === 'function') C.prototype[mm] = function () { const r = o.apply(this, arguments); rec(r); return r; };
          }
        }
        const origFrom = window.Array.from;
        if (origFrom) window.Array.from = function () { const r = origFrom.apply(this, arguments); rec(r); return r; };
      },
    }).then((dom) => {
      setTimeout(() => {
        try {
          const c = dom.cookieJar.getCookieStringSync(B + '/');
          const Pval = (c.match(/P=([^;]*)/) || [])[1];
          const w = dom.window;
          const nsd = w.$_ts ? w.$_ts.nsd : null;
          const cd = w.$_ts ? w.$_ts.cd : null;
          const k48 = found.filter(a => a.length === 48);
          const k16 = found.filter(a => a.length === 16);
          let result = { nsd, cdLen: cd ? cd.length : 0, k48: k48.length, k16: k16.length, P: Pval ? Pval.slice(0, 6) : null };
          if (Pval && k48.length) {
            const pBytes = dB64(Pval.slice(1));
            const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
            const dec = parser.encryptMode2([...pBytes], k16a, 1);
            const na = dec.slice(4);
            const cookieK2 = na.slice(11, 59);
            const beLen = (na[59] & 0x7f) << 8 | na[60];
            const be = na.slice(61, 61 + beLen);
            // 遍历 16B 候选找 keys17（解出合法 base 头）
            for (const k17c of k16) {
              try {
                const k17a = parser.numarrAddTime([...k17c], 0, 1 / 256)[0];
                const tmp = parser.encryptMode2([...be], k17a, 0);
                const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
                const base = bestTrim(hdecRaw(huff), huff);
                if (base.length > 100 && (base[0] === 179 || base[0] === 59)) {
                  result.base = base;
                  result.baseLen = base.length;
                  result.baseHead = base.slice(0, 12).join(',');
                  result.keys17 = k17c;
                  break;
                }
              } catch (e) {}
            }
            if (!result.base) result.err = '无合法 base';
          } else {
            result.err = '无 P 或 keys2';
          }
          dom.window.close();
          resolve(result);
        } catch (e) {
          dom.window.close();
          resolve({ err: e.message });
        }
      }, 10000);
    }).catch(e => resolve({ err: e.message }));
  });
}

(async () => {
  const samples = [];
  for (let i = 0; i < 4; i++) {
    const s = await collectOne(i);
    console.log('[S3] #' + i + ':', JSON.stringify(s).substring(0, 240));
    if (s.base) samples.push(s);
  }
  if (samples.length >= 2) {
    const anchors = [60, 65, 68, 80, 95, 100, 135, 150, 160];
    console.log('\n=== 锚点跨会话（真实代理 sdenv）===');
    for (const a of anchors) {
      const vals = samples.map(s => s.base[a]);
      console.log('[' + a + ']:', vals.join(','), new Set(vals).size > 1 ? '❌ 变' : '✅ 固定');
    }
    console.log('\n=== [27:67] 环境段对比 ===');
    const seg0 = samples[0].base.slice(27, 67).join(',');
    console.log('s#0:', seg0);
    samples.slice(1).forEach((s, i) => {
      const seg = s.base.slice(27, 67).join(',');
      console.log('s#' + (i + 1) + ':', seg, seg === seg0 ? '✅ 相同' : '❌ 不同');
    });
  }
  fs.writeFileSync('/tmp/nx_anchor_real.json', JSON.stringify(samples, null, 1));
  console.log('\nsaved /tmp/nx_anchor_real.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
