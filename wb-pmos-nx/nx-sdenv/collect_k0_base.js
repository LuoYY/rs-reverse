// 综合采集：sdenv 中捕获 _\$k0（cd 派生常量池）+ 解 base → 验证 base[22:29] = k0[特定索引]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { jsdomFromUrl } = require('sdenv');
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';
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
  const r = s.length - q;
  if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4));
  else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2));
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
function decryptCd(str) {
  const idxmap = {};
  NX_BS.split('').forEach((k, i) => { idxmap[k] = i; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3];
    if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4));
    if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2));
    if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]);
  }
  return ans;
}
function getLensGo(numarr, idx) {
  const item = numarr[idx]; idx++;
  let lens;
  if ((item & 128) === 0) lens = item;
  else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
  else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
  else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
  else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
  else lens = item;
  return [lens, idx];
}
function genKeysSim(ans) {
  const keys = [];
  let op = 1, gap;
  try {
    for (let i = 0; i < ans[0]; i++) {
      [gap, op] = getLensGo(ans, op);
      if (gap < 0 || op + gap > ans.length) return null;
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
  } catch (e) { return null; }
  return keys;
}
function deriveOffsetNx(tail) {
  if (tail.length < 40) return null;
  const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
  for (let k0 = 0; k0 <= 127; k0++) {
    const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
    for (let k1 = 0; k1 <= 127; k1++) {
      const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
      const offset = [off0, off1, off2, off3, off4, off5, off6, off7];
      const ans = tail.map((b, i) => b ^ offset[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      const keys = genKeysSim(ans);
      if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 &&
        keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 &&
        keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset;
    }
  }
  return null;
}
function deriveKeys(cd) {
  const cdArr = decryptCd(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  const offset = deriveOffsetNx(tail);
  if (!offset) return null;
  const ans = tail.map((b, i) => b ^ offset[i % 8]);
  return genKeysSim(ans);
}

(async () => {
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        // 插桩：捕获 _\$k0 生成（pc=6: k0=nP(ez) 后的赋值）
        let c = code;
        const k0Init = '_$k0=_$nP(_$ez);';
        if (c.indexOf(k0Init) >= 0) {
          c = c.replace(k0Init, 'try{globalThis.__k0cap=Array.from(_$k0);}catch(e){}' + k0Init + 'try{globalThis.__k0cap=Array.from(_$k0);}catch(e){}');
          console.log('[K0B] k0 插桩 OK');
        }
        code = c;
      }
    } catch (e) {}
    return origRun(code, ctx, opts);
  };

  const samples = [];
  for (let i = 0; i < 3; i++) {
    let capTs = null;
    let k0cap = null;
    patched = false;
    const dom = await jsdomFromUrl(B + '/', {
      userAgent: UA, proxy: SDENV_PROXY, consoleConfig: { error: new Function() },
    });
    const w = dom.window;
    await new Promise((resolve) => {
      const t0 = Date.now(); let lastLen = 0;
      const iv = setInterval(() => {
        try {
          if (!capTs && w.$_ts && w.$_ts.cd) capTs = { nsd: w.$_ts.nsd, cd: w.$_ts.cd };
          if (!k0cap) { try { k0cap = w.__k0cap; } catch (e) {} }
          const c = dom.cookieJar.getCookieStringSync(B + '/');
          const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
          if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); return; }
          lastLen = pLen;
          if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
        } catch (e) {}
      }, 300);
    });
    const c = dom.cookieJar.getCookieStringSync(B + '/');
    const Pval = (c.match(/P=([^;]*)/) || [])[1];
    try {
      const keys = capTs && capTs.cd ? deriveKeys(capTs.cd) : null;
      let result = { nsd: capTs ? capTs.nsd : null, k0len: k0cap ? k0cap.length : 0 };
      if (k0cap) result.k0head = k0cap.slice(0, 8);
      if (Pval && keys) {
        const pBytes = dB64(Pval.slice(1));
        const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
        const dec = parser.encryptMode2([...pBytes], k16a, 1);
        const na = dec.slice(4);
        const cookieK2 = na.slice(11, 59);
        const beLen = (na[59] & 0x7f) << 8 | na[60];
        const be = na.slice(61, 61 + beLen);
        const k17a = parser.numarrAddTime([...keys[17]], 0, 1 / 256)[0];
        const tmp = parser.encryptMode2([...be], k17a, 0);
        const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
        const base = bestTrim(hdecRaw(huff), huff);
        if (base.length > 100) {
          result.base = base;
          result.baseHead = base.slice(0, 12).join(',');
          result.base22 = base.slice(22, 29);
          // 验证 base[22] = k0[144]?
          if (k0cap) {
            result.k0_144 = k0cap[144];
            result.k0_126 = k0cap[126];
            result.k0_68 = k0cap[68];
            result.k0_2 = k0cap[2];
            result.k0_203 = k0cap[203];
            result.k0_278 = k0cap[278];
          }
        }
      }
      console.log('[K0B] #' + i + ':', JSON.stringify(result).substring(0, 300));
      samples.push(result);
    } catch (e) {
      console.log('[K0B] #' + i + ' ERR:', e.message.substring(0, 80));
    }
    dom.window.close();
  }
  fs.writeFileSync('/tmp/nx_k0_base.json', JSON.stringify(samples, null, 1));
  console.log('saved /tmp/nx_k0_base.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
