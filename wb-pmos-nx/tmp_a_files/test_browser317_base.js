// 决定性测试：用浏览器权威 317B base 样本 + deriveKeys(cd) → 生成 cookie → 测试 200
// 如果 200 → base 无需反编译（用权威样本模板即可），[78:90] f 公式问题解除！
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
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
const BROWSER317 = [176, 35, 250, 1, 166, 209, 172, 217, 115, 19, 125, 245, 137, 0, 14, 16, 0, 0, 157, 90, 222, 228, 202, 181, 12, 228, 133, 15, 164, 2, 171, 0, 199, 0, 0, 223, 40, 34, 22, 187, 217, 129, 103, 43, 17, 0, 8, 44, 117, 142, 0, 134, 37, 243, 28, 215, 94, 191, 119, 78, 153, 0, 160, 41, 0, 86, 201, 243, 0, 219, 221, 219, 39, 210, 39, 124, 32, 230, 21, 58, 0, 35, 223, 118, 45, 21, 131, 0, 46, 144, 243, 153, 0, 176, 238, 120, 0, 9, 24, 40, 0, 0, 171, 126, 131, 0, 62, 209, 0, 162, 10, 117, 120, 16, 232, 167, 188, 0, 153, 0, 239, 0, 149, 0, 21, 211, 0, 109, 194, 0, 204, 0, 167, 140, 147, 0, 175, 210, 124, 175, 133, 12, 118, 236, 11, 224, 163, 25, 112, 34, 43, 174, 78, 213, 6, 206, 113, 0, 195, 0, 133, 0, 162, 192, 0, 236, 236, 20, 133, 216, 191, 144, 247, 56, 219, 184, 17, 119, 200, 34, 0, 38, 0, 30, 147, 156, 119, 10, 184, 233, 177, 108, 36, 200, 167, 45, 61, 29, 28, 15, 244, 210, 141, 212, 202, 81, 162, 59, 123, 197, 200, 194, 150, 176, 158, 223, 135, 72, 0, 135, 238, 244, 17, 173, 136, 39, 209, 226, 0, 225, 199, 152, 124, 46, 244, 176, 171, 222, 246, 34, 198, 150, 180, 197, 0, 103, 248, 168, 244, 118, 213, 98, 43, 0, 41, 251, 206, 22, 74, 0, 108, 58, 132, 0, 33, 146, 0, 170, 137, 222, 101, 138, 169, 217, 120, 0, 21, 0, 252, 223, 0, 124, 0, 30, 46, 3, 34, 208, 0, 213, 209, 0, 181, 0, 159, 139, 5, 180, 54, 253, 0, 0, 231, 93, 46, 0, 146, 220, 124, 220, 219, 81, 25, 72, 211, 0, 0];
function decryptCd(str) { const idxmap = {}; NX_BS.split('').forEach((k, i) => { idxmap[k] = i; }); const ans = []; for (let i = 0; i < str.length; i += 4) { const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3]; if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4)); if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2)); if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]); } return ans }
function getLensGo(numarr, idx) { const item = numarr[idx]; idx++; let lens; if ((item & 128) === 0) lens = item; else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; } else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; } else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; } else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; } else lens = item; return [lens, idx] }
function genKeysSim(ans) { const keys = []; let op = 1, gap; try { for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap } } catch (e) { return null } return keys }
function deriveOffsetNx(tail) { if (tail.length < 40) return null; const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48; for (let k0 = 0; k0 <= 127; k0++) { const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0; for (let k1 = 0; k1 <= 127; k1++) { const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1; const offset = [off0, off1, off2, off3, off4, off5, off6, off7]; const ans = tail.map((b, i) => b ^ offset[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; const keys = genKeysSim(ans); if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 && keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 && keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset } } return null }
function deriveKeys(cd) { const cdArr = decryptCd(cd); const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); const offset = deriveOffsetNx(tail); if (!offset) return null; const ans = tail.map((b, i) => b ^ offset[i % 8]); return genKeysSim(ans) }
function buildCookie(base, keys2, keys17, r2mka, startT) { const random = Math.random(); const basearrEncrypt = parser.encryptMode1(parser.xor(parser.numarrEncrypt(base), keys2, 16), parser.numarrAddTime([...keys17], r2mka, random)[0], 0); const nextarr = [4, 8, ...parser.numToNumarr4(r2mka), ...parser.numToNumarr4(startT), 48, ...keys2, basearrEncrypt.length >> 8 & 255 | 128, basearrEncrypt.length & 255, ...basearrEncrypt]; return 'a' + parser.numarr2string(parser.encryptMode1([...parser.numToNumarr4(parser.uuid(nextarr)), ...nextarr], parser.numarrAddTime([...K16], r2mka, random)[0], 1, random), NX_BS.slice(0, 64).split('')) }
function httpGetProxy(url, cookieH) { return new Promise((resolve) => { const p = new URL(SDENV_PROXY); const auth = 'Basic ' + Buffer.from(p.username + ':' + p.password).toString('base64'); const u = new URL(url); const cr = http.request({ host: p.hostname, port: +p.port, method: 'CONNECT', path: `${u.hostname}:${u.port || 443}`, headers: { 'Proxy-Authorization': auth, Host: `${u.hostname}:${u.port || 443}` }, timeout: 25000 }); cr.on('connect', (res, socket) => { if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; } const ts = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => { ts.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\n${cookieH ? `Cookie: ${cookieH}\r\n` : ''}Connection: close\r\n\r\n`); }); let body = ''; ts.on('data', d => body += d); ts.on('end', () => { const st = parseInt((body.match(/HTTP\/1\.1 (\d+)/) || [])[1] || '0'); resolve({ status: st }); }); ts.on('error', () => resolve({ status: 'ERR' })); }); cr.on('error', () => resolve({ status: 'ERR' })); cr.end(); }) }

(async () => {
  // 采集当前会话（真实代理）
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
        if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
        lastLen = pLen;
        if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
      } catch (e) {}
    }, 300);
  });
  const c = dom.cookieJar.getCookieStringSync(B + '/');
  const O = (c.match(/O=([^;]*)/) || [])[1];
  const Pval = (c.match(/P=([^;]*)/) || [])[1];
  const keys = deriveKeys(capTs.cd);
  const pBytes = Buffer.from(Pval.slice(1), 'base64'); // 注意：真实 P 需 dB64
  // 用 dB64
  function dB64(s) { const m = {}; for (let i = 0; i < 64; i++) m[NX_BS[i]] = i; const o = []; let q = 0; for (let g = 0; g < Math.floor(s.length / 4); g++) { const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]]; q += 4; o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3) } const r = s.length - q; if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4)); else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2)); return o }
  const pB = dB64(Pval.slice(1));
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = parser.encryptMode2([...pB], k16a, 1);
  const na = dec.slice(4);
  const r2mka = ((na[2] << 24 | na[3] << 16 | na[4] << 8 | na[5]) >>> 0);
  const startT = ((na[6] << 24 | na[7] << 16 | na[8] << 8 | na[9]) >>> 0);
  const oC = '3RKyaeh47p90O=' + O;
  const Pname = '3RKyaeh47p90P';
  console.log('[B317] nsd=' + capTs.nsd + ' keys2 len=' + keys[2].length + ' r2mka=' + r2mka);
  console.log('[B317] 浏览器317B base len=' + BROWSER317.length);

  // 测试1: 用浏览器 317B base 构建 cookie
  console.log('[B317] 用浏览器317B base → buildCookie → GET...');
  let res = await httpGetProxy(API, oC + '; ' + Pname + '=' + buildCookie(BROWSER317, keys[2], keys[17], r2mka, startT));
  console.log('[B317] 浏览器317B base:', res.status);

  // 测试2: 用 sdenv 真实 base 对照
  const k17a = parser.numarrAddTime([...keys[17]], 0, 1 / 256)[0];
  const tmp = parser.encryptMode2([...na.slice(61, 61 + ((na[59] & 0x7f) << 8 | na[60]))], k17a, 0);
  console.log('[B317] sdenv base 对照...');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[B317] FATAL:', e && e.message); process.exit(1); });
