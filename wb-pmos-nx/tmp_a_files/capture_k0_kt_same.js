// 同会话捕获：_$k0 常量池 + _$ez + _$kt 最终 + base（从 P cookie 解码）
// 目标：验证 base = f(_$k0 索引序列)，打通纯算法链路
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
function dB64(s) { const m = {}; for (let i = 0; i < 64; i++) m[NX_BS[i]] = i; const o = []; let q = 0; for (let g = 0; g < Math.floor(s.length / 4); g++) { const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]]; q += 4; o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3) } const r = s.length - q; if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4)); else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2)); return o }
function getTree() { let a = []; for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const mm = byLen[val]; if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }
function bestTrim(raw, huff) { const hh = huff.slice(0, huff.length - 1); for (let L = raw.length; L >= 1; L--) { const e = henc(raw.slice(0, L)); if (JSON.stringify(e.slice(0, e.length - 1)) === JSON.stringify(hh)) return raw.slice(0, L) } return raw }
function henc(num) { const ans = []; let one = 0, two = 0; for (const b of num) { const c = cfg[b]; if (!c) continue; one = one << c.val | c.key; two += c.val; while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8 } } if (two > 0) ans.push(one << 8 - two | 0x68 >> two); return ans }
function decryptCd(str) { const idxmap = {}; NX_BS.split('').forEach((k, i) => { idxmap[k] = i; }); const ans = []; for (let i = 0; i < str.length; i += 4) { const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3]; if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4)); if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2)); if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]); } return ans }
function getLensGo(numarr, idx) { const item = numarr[idx]; idx++; let lens; if ((item & 128) === 0) lens = item; else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; } else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; } else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; } else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; } else lens = item; return [lens, idx] }
function genKeysSim(ans) { const keys = []; let op = 1, gap; try { for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap } } catch (e) { return null } return keys }
function deriveOffsetNx(tail) { if (tail.length < 40) return null; const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48; for (let k0 = 0; k0 <= 127; k0++) { const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0; for (let k1 = 0; k1 <= 127; k1++) { const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1; const offset = [off0, off1, off2, off3, off4, off5, off6, off7]; const ans = tail.map((b, i) => b ^ offset[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; const keys = genKeysSim(ans); if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 && keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 && keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset } } return null }
function deriveKeys(cd) { const cdArr = decryptCd(cd); const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); const offset = deriveOffsetNx(tail); if (!offset) return null; const ans = tail.map((b, i) => b ^ offset[i % 8]); return genKeysSim(ans) }

(async () => {
  console.log('[K0] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[K0] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 1. hook _$g1 捕获最终 _$kt
        const g1Target = 'function _$g1(){_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
        if (c.indexOf(g1Target) >= 0) {
          const inject = 'function _$g1(){try{window.__ktFinal=Array.isArray(_$kt)?Array.from(_$kt):null;}catch(__e){}_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
          c = c.split(g1Target).join(inject);
          console.log('[K0] _$g1 注入 OK');
        }
        // 2. hook _$k0=_$nP(_$ez) 捕获常量池
        const k0Target = '_$k0=_$nP(_$ez);';
        if (c.indexOf(k0Target) >= 0) {
          const inject = `_$k0=_$nP(_$ez);try{var __ez0=null;if(typeof _$ez==="string"){__ez0=["s",Array.from(_$ez).map(function(x){return x.charCodeAt(0);})];}else if(Array.isArray(_$ez)){__ez0=["a",Array.from(_$ez)];}else{__ez0=["o"];}window.__k0Snap={ez:__ez0,k0:Array.isArray(_$k0)?Array.from(_$k0):null};}catch(__e){window.__k0E=String(__e);}`;

          c = c.split(k0Target).join(inject);
          console.log('[K0] _$k0 hook OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_k0_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[K0] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  let capTs = null;
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      try {
        if (!capTs && w.$_ts && w.$_ts.cd) capTs = { nsd: w.$_ts.nsd, cd: w.$_ts.cd };
        const c = dom.cookieJar.getCookieStringSync(B + '/');
        const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
        if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
        lastLen = pLen;
        if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
      } catch (e) {}
    }, 300);
  });
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  const k0s = ev('typeof __k0Snap!=="undefined"?JSON.stringify(__k0Snap):null');
  const ktf = ev('typeof __ktFinal!=="undefined"?JSON.stringify(__ktFinal):null');
  console.log('[K0] k0Snap:', k0s ? 'ez=' + JSON.parse(k0s).ez[0] + ' len=' + JSON.parse(k0s).ez[1].length + ' k0=' + JSON.parse(k0s).k0.length : 'null');
  console.log('[K0] ktFinal:', ktf ? JSON.parse(ktf).length : 'null');
  console.log('[K0] err:', ev('typeof __k0E!=="undefined"?__k0E:null'));
  const c = dom.cookieJar.getCookieStringSync(B + '/');
  const Pval = (c.match(/P=([^;]*)/) || [])[1];
  console.log('[K0] cd:', capTs ? capTs.cd.length : 'null', 'Plen:', Pval ? Pval.length : 0);
  const out = {
    nsd: capTs && capTs.nsd, cd: capTs && capTs.cd,
    k0Snap: k0s ? JSON.parse(k0s) : null,
    ktFinal: ktf ? JSON.parse(ktf) : null,
    Pval: Pval || null,
  };
  if (capTs && capTs.cd && Pval) {
    const keys = deriveKeys(capTs.cd);
    out.keys = keys;
    if (!keys) { console.log('[K0] deriveKeys 失败'); fs.writeFileSync(path.join(__dirname, 'nx_k0_kt_same.json'), JSON.stringify(out)); dom.window.close(); process.exit(0); }
    const pB = dB64(Pval.slice(1));
    const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
    const dec = parser.encryptMode2([...pB], k16a, 1);
    const na = dec.slice(4);
    const cookieK2 = na.slice(11, 59);
    const beLen = (na[59] & 0x7f) << 8 | na[60];
    const be = na.slice(61, 61 + beLen);
    const k17a = parser.numarrAddTime([...keys[17]], 0, 1 / 256)[0];
    const tmp = parser.encryptMode2([...be], k17a, 0);
    const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
    const base = bestTrim(hdecRaw(huff), huff);
    out.base = base;
    out.cookieK2 = cookieK2;
    out.beLen = beLen;
    console.log('[K0] base len=' + base.length + ' head=' + base.slice(0, 12).join(','));
    // 验证 ktFinal[65:] 解码 == base
    if (ktf) {
      const kt = JSON.parse(ktf);
      const k2 = kt.slice(15, 63);
      const xor = kt.slice(65).map((v, i) => i < 16 ? (v ^ k2[i]) : v);
      const b2 = hdecRaw(xor);
      console.log('[K0] kt[65:]→huffman len=' + b2.length + ' head=' + b2.slice(0, 12).join(','));
      let same = 0;
      for (let i = 0; i < Math.min(b2.length, base.length); i++) if (b2[i] === base[i]) same++;
      console.log('[K0] kt解码 vs base 匹配: ' + same + '/' + Math.min(b2.length, base.length));
    }
  }
  fs.writeFileSync(path.join(__dirname, 'nx_k0_kt_same.json'), JSON.stringify(out));
  console.log('[K0] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e && e.stack); process.exit(1); });
