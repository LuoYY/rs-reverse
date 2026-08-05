// 终极验证：模板 base + 随机自由段 → 200?
// 以及跨会话复用 base → 200?
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const http = require('http');
const tls = require('tls');
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const API = 'https://pmos.nx.sgcc.com.cn:10443/px-gateway/GatewayConfig/getGatewayConfig';
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
function buildCookie(base, keys2, keys17, r2mka, startT) { const random = Math.random(); const basearrEncrypt = parser.encryptMode1(parser.xor(parser.numarrEncrypt(base), keys2, 16), parser.numarrAddTime([...keys17], r2mka, random)[0], 0); const nextarr = [4, 8, ...parser.numToNumarr4(r2mka), ...parser.numToNumarr4(startT), 48, ...keys2, basearrEncrypt.length >> 8 & 255 | 128, basearrEncrypt.length & 255, ...basearrEncrypt]; return 'a' + parser.numarr2string(parser.encryptMode1([...parser.numToNumarr4(parser.uuid(nextarr)), ...nextarr], parser.numarrAddTime([...K16], r2mka, random)[0], 1, random), NX_BS.slice(0, 64).split('')) }
function httpGetProxy(url, cookieH) { return new Promise((resolve) => { const p = new URL(SDENV_PROXY); const auth = 'Basic ' + Buffer.from(p.username + ':' + p.password).toString('base64'); const u = new URL(url); const cr = http.request({ host: p.hostname, port: +p.port, method: 'CONNECT', path: `${u.hostname}:${u.port || 443}`, headers: { 'Proxy-Authorization': auth, Host: `${u.hostname}:${u.port || 443}` }, timeout: 25000 }); cr.on('connect', (res, socket) => { if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; } const ts = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => { ts.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\n${cookieH ? `Cookie: ${cookieH}\r\n` : ''}Connection: close\r\n\r\n`); }); let body = ''; ts.on('data', d => body += d); ts.on('end', () => { const st = parseInt((body.match(/HTTP\/1\.1 (\d+)/) || [])[1] || '0'); resolve({ status: st }); }); ts.on('error', () => resolve({ status: 'ERR' })); }); cr.on('error', () => resolve({ status: 'ERR' })); cr.end(); }) }

(async () => {
  // 加载已采集样本
  const samples = JSON.parse(fs.readFileSync('/tmp/nx_many_samples.json', 'utf8'));
  if (samples.length < 2) { console.log('[UT] 样本不足'); process.exit(1); }
  // 重新采集一个新会话做测试基座
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
  const O = (c.match(/O=([^;]*)/) || [])[1];
  const keys = deriveKeys(capTs.cd);
  const r2mka = Math.floor(Date.now() / 1000) - 30;
  const startT = Math.floor(Date.now() / 1000) - 60;
  const oC = '3RKyaeh47p90O=' + O;
  const Pname = '3RKyaeh47p90P';
  console.log('[UT] 新会话 nsd=' + capTs.nsd + ' keys=' + (keys ? 'ok' : 'fail'));

  // 用样本#0 的完整 base 直接重构（跨会话复用）
  const templateBase = samples[0].base;
  console.log('[UT] 模板 base [60][65]:', templateBase[60], templateBase[65], 'len=' + templateBase.length);
  let cookie = buildCookie(templateBase, keys[2], keys[17], r2mka, startT);
  let res = await httpGetProxy(API, oC + '; ' + Pname + '=' + cookie);
  console.log('[UT] 跨会话复用 base:', res.status);

  // 随机化自由段 [22][23][24][26][68]
  const modBase = [...templateBase];
  modBase[22] = Math.floor(Math.random() * 256);
  modBase[23] = Math.floor(Math.random() * 256);
  modBase[24] = Math.floor(Math.random() * 256);
  modBase[26] = Math.floor(Math.random() * 256);
  modBase[68] = Math.floor(Math.random() * 256);
  cookie = buildCookie(modBase, keys[2], keys[17], r2mka, startT);
  res = await httpGetProxy(API, oC + '; ' + Pname + '=' + cookie);
  console.log('[UT] 模板+随机自由段:', res.status);

  // 用另一个模板 [60][65]（跨组）
  const otherTpl = samples.find(s => s.b60 !== templateBase[60]);
  if (otherTpl) {
    const altBase = [...templateBase];
    altBase[60] = otherTpl.b60;
    altBase[65] = otherTpl.b65;
    cookie = buildCookie(altBase, keys[2], keys[17], r2mka, startT);
    res = await httpGetProxy(API, oC + '; ' + Pname + '=' + cookie);
    console.log('[UT] 换环境模板[60][65]=' + otherTpl.b60 + ',' + otherTpl.b65 + ':', res.status);
  }
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[UT] FATAL:', e.message); process.exit(1); });
