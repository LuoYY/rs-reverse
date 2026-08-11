// 采集 (nsd, cd, keys2, keys17, base, r2mka, startT) 完整样本
// 用于分析 [78:90]+[146:152] = f(keys) 数学关系
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const fs = require('fs');
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
function dB64(s) { const m = {}; for (let i = 0; i < 64; i++) m[NX_BS[i]] = i; const o = []; let q = 0; for (let g = 0; g < Math.floor(s.length / 4); g++) { const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]]; q += 4; if (c0 === undefined) return null; o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3) } const r = s.length - q; if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4)); else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2)); return o }
function getTree() { let a = []; for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const mm = byLen[val]; if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }
function henc(num) { const ans = []; let one = 0, two = 0; for (const b of num) { const c = cfg[b]; if (!c) continue; one = one << c.val | c.key; two += c.val; while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8 } } if (two > 0) ans.push(one << 8 - two | 0x68 >> two); return ans }
function bestTrim(raw, huff) { const hh = huff.slice(0, huff.length - 1); for (let L = raw.length; L >= 1; L--) { const e = henc(raw.slice(0, L)); if (JSON.stringify(e.slice(0, e.length - 1)) === JSON.stringify(hh)) return raw.slice(0, L) } return raw }
function decryptCd(str) { const idxmap = {}; NX_BS.split('').forEach((k, i) => { idxmap[k] = i; }); const ans = []; for (let i = 0; i < str.length; i += 4) { const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3]; if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4)); if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2)); if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]); } return ans }
function getLensGo(numarr, idx) { const item = numarr[idx]; idx++; let lens; if ((item & 128) === 0) lens = item; else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; } else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; } else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; } else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; } else lens = item; return [lens, idx] }
function genKeysSim(ans) { const keys = []; let op = 1, gap; try { for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap } } catch (e) { return null } return keys }
function deriveOffsetNx(tail) { if (tail.length < 40) return null; const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48; for (let k0 = 0; k0 <= 127; k0++) { const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0; for (let k1 = 0; k1 <= 127; k1++) { const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1; const offset = [off0, off1, off2, off3, off4, off5, off6, off7]; const ans = tail.map((b, i) => b ^ offset[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; const keys = genKeysSim(ans); if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 && keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 && keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset } } return null }
function deriveKeys(cd) { const cdArr = decryptCd(cd); const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); const offset = deriveOffsetNx(tail); if (!offset) return null; const ans = tail.map((b, i) => b ^ offset[i % 8]); return genKeysSim(ans) }

(async () => {
  const N = parseInt(process.argv[2] || '6', 10);
  console.log('[FS] 采集 ' + N + ' 个完整样本...');
  const samples = [];
  for (let i = 0; i < N; i++) {
    try {
      let capTs = null;
      const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: SDENV_PROXY, consoleConfig: { error: new Function() } });
      const w = dom.window;
      await new Promise((resolve) => {
        const t0 = Date.now(); let lastLen = 0;
        const iv = setInterval(() => {
          try {
            if (!capTs && w.$_ts && w.$_ts.cd) capTs = { nsd: w.$_ts.nsd, cd: w.$_ts.cd };
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
      const keys = deriveKeys(capTs.cd);
      const pBytes = dB64(Pval.slice(1));
      const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
      const dec = parser.encryptMode2([...pBytes], k16a, 1);
      const na = dec.slice(4);
      const cookieK2 = na.slice(11, 59);
      const beLen = (na[59] & 0x7f) << 8 | na[60];
      const be = na.slice(61, 61 + beLen);
      const k17a = parser.numarrAddTime([...keys[17]], 0, 1 / 256)[0];
      const tmp = parser.encryptMode2([...be], k17a, 0);
      const huff = tmp.map((v, j) => j < 16 ? (v ^ cookieK2[j]) : v);
      const base = bestTrim(hdecRaw(huff), huff);
      const r2mka = ((na[2] << 24 | na[3] << 16 | na[4] << 8 | na[5]) >>> 0);
      const startT = ((na[6] << 24 | na[7] << 16 | na[8] << 8 | na[9]) >>> 0);
      samples.push({ nsd: capTs.nsd, cd: capTs.cd, keys2: keys[2], keys17: keys[17], base, r2mka, startT, b60: base[60], b65: base[65] });
      console.log('[FS] #' + i + ' nsd=' + capTs.nsd + ' len=' + base.length + ' b60/b65=' + base[60] + '/' + base[65] + ' [78:90]=' + base.slice(78, 90).join(','));
      dom.window.close();
    } catch (e) { console.log('[FS] #' + i + ' ERR ' + (e.message || '').slice(0, 60)); }
    await new Promise(r => setTimeout(r, 600));
  }
  fs.writeFileSync(path.join(ROOT, 'wb-pmos-nx/tmp_a_files/nx_full_samples.json'), JSON.stringify(samples, null, 1));
  console.log('[FS] saved ' + samples.length + ' samples');
  process.exit(0);
})().catch(e => { console.error('[FS] FATAL:', e && e.message); process.exit(1); });
