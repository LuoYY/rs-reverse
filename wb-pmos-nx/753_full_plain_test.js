/**
 * 753_full_plain_test.js
 * 用最终明文 basearr（cap 167，113 开头）重构 cookie 测服务器
 * 之前 744 A 用中间态(130/150) 412——最终明文(167)可能才是正确的！
 * A: cap(167 明文) + keys2
 * B: b86[2:169]（标记位置 b86 原值）+ keys2
 * C: 589 base + keys2（对照）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const API = '/px-common-authcenter/auth/v2/captcha/get';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_AUTH = 'Basic ' + Buffer.from('74940609:aFmWc5Fs').toString('base64');

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
function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: '36.134.44.6', port: 2018, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` }, timeout: 25000,
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
const { execSync } = require('child_process');
function runCurl(apiUrl, hdrQ, cookieStr, label) {
  try {
    const curlCmd = `curl -s -o /tmp/753_api.html -w "%{http_code}" -x "http://74940609:aFmWc5Fs@36.134.44.6:2018" --max-time 20 '${apiUrl}' \
-H 'Accept: application/json, text/plain, */*' -H 'ClientTag: OUTNET_BROWSE' -H 'Content-Type: application/json;charset=UTF-8' \
-H 'CurrentRoute: /outNet' -H 'MurR7rxG: ${hdrQ}' -H 'Origin: https://pmos.nx.sgcc.com.cn:10443' -H 'Referer: ${TARGET}' \
-H 'User-Agent: ${UA}' -H 'X-Ticket: undefined' -H 'X-Token: null' -b '${cookieStr}' \
--data-raw '{"captchaType":"blockPuzzle"}'`;
    const code = execSync(curlCmd, { timeout: 30000 }).toString().trim();
    const body = fs.readFileSync('/tmp/753_api.html', 'utf8');
    console.log(label + ':', code, body.substring(0, 60).replace(/\n/g, ' '));
  } catch (e) { console.log(label + ': err', ((e.stdout || '').toString().trim() || '').substring(0, 50)); }
}

(async () => {
  const ch = await httpsGet(TARGET);
  const mm = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const ts = { nsd: +mm[1], cd: mm[2] };
  const oCookie = ch.setCookies.find(c => /O=/.test(c)) || '';
  const b86 = decodeB86(ts.cd);
  console.log('nsd=' + ts.nsd);

  // CDP 捕获最终明文 basearr（最大）+ P cookie
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && this[0] === 113 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && (!window.__capLen || this.length > window.__capLen)) ? (window.__capArr = Array.from(this), window.__capLen = this.length, false) : false',
  });
  cdp.on('Debugger.paused', async () => { await cdp.send('Debugger.resume').catch(() => {}); });
  await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }).catch(() => {});
  await new Promise(r => setTimeout(r, 15000));
  let cap = null;
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__capArr ? JSON.stringify(window.__capArr) : "null"', returnByValue: true });
    cap = JSON.parse(r.result?.value || 'null');
  } catch (e) {}
  let p = null;
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(5000);
    const ck = await context.cookies();
    p = ck.find(c => /P$/.test(c.name));
    if (p) break;
  }
  await page.close();
  await browser.close();
  if (!cap || !p) { console.log('采集失败', !!cap, !!p); process.exit(1); }
  console.log('最终明文 basearr len:', cap.length, '[0-15]:', cap.slice(0, 16).join(','));
  console.log('P len:', p.value.length);

  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode2, encryptMode1 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const numarr2string = require(path.join(ROOT, 'src/handler/parser/common/numarr2string'));
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
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
  function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
    if (tree.idx === undefined) {
      getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
      getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
    } else arr[tree.idx] = config;
    return arr;
  }
  let huffEncCfg = null;
  function nxEncrypt(numarr) {
    if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
    const ans = [];
    let one = 0, two = 0;
    for (let i = 0; i < numarr.length; i++) {
      const cfg = huffEncCfg[numarr[i]];
      one = one << cfg.val | cfg.key;
      two += cfg.val;
      while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
    }
    if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
    return ans;
  }
  function huffmanDecodeRaw(enc) {
    const encCfg = getEncCfg(getTree());
    const byLenMap = {}; let maxL = 0;
    for (let idx = 0; idx < 256; idx++) {
      const c = encCfg[idx];
      if (!c) continue;
      if (!byLenMap[c.val]) byLenMap[c.val] = {};
      byLenMap[c.val][c.key] = idx;
      if (c.val > maxL) maxL = c.val;
    }
    const ans = [];
    let key = 0, val = 0;
    for (let i = 0; i < enc.length; i++) {
      for (let b = 7; b >= 0; b--) {
        key = (key << 1) | ((enc[i] >> b) & 1);
        val++;
        const mm = byLenMap[val];
        if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
        if (val > maxL) { key = 0; val = 0; }
      }
    }
    return ans;
  }
  // 解 cookie
  const dec = encryptMode2([...decodeB86(p.value.slice(1))], keys16arr, 1);
  const na = dec.slice(4);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const keys2 = na.slice(11, 59);
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
  const der = deriveKeys(decryptCd(ts.cd));
  if (!der) { console.log('keys 派生失败'); process.exit(1); }
  const keys17arr = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
  const tmp = encryptMode2([...be], keys17arr, 0);
  const huff = tmp.map((v, j) => j < 16 ? (v ^ keys2[j]) : v);
  const raw = huffmanDecodeRaw(huff);
  let bestLen = 0;
  const huffHead = huff.slice(0, huff.length - 1);
  for (let L = raw.length; L >= 1; L--) {
    const enc = nxEncrypt(raw.slice(0, L));
    if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
  }
  const base589 = raw.slice(0, bestLen);
  console.log('589 base len:', base589.length, '[0-15]:', base589.slice(0, 16).join(','));

  const uuidFn = require(path.join(ROOT, 'src/handler/parser/common/uuid'));
  const numToNumarr4 = require(path.join(ROOT, 'src/handler/parser/common/numToNumarr4'));
  function buildCookie(newBase) {
    const huffA = nxEncrypt(newBase);
    const xorNew = [...huffA];
    for (let i = 0; i < 16; i++) xorNew[i] ^= keys2[i];
    const now = Math.floor(Date.now() / 1000);
    const nt = numarrAddTime([...der.keys[17]], now, Math.random())[0];
    const beNew = encryptMode1(xorNew, nt, 0);
    const newNa = [
      4, 8, ...numToNumarr4(now), ...numToNumarr4(now), 48, ...keys2,
      (beNew.length >> 8 & 255) | 128, beNew.length & 255, ...beNew,
    ];
    const u4 = numToNumarr4(uuidFn(newNa));
    return 'a' + numarr2string(encryptMode1([...u4, ...newNa], keys16arr, 1), B86_64);
  }
  function crc32b(buf) {
    let c = ~0;
    for (const d of buf) {
      c ^= d;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
  }
  const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
  const randByte = () => Math.floor(Math.random() * 256);
  function genQuery(urlPath) {
    const cu = crc32b(Buffer.from(urlPath.toUpperCase()));
    const plain24 = [
      keys2[0] ^ MASK[0], keys2[1] ^ MASK[1], keys2[2] ^ MASK[2], keys2[3] ^ MASK[3],
      keys2[4] ^ MASK[4], keys2[5] ^ MASK[5], keys2[6] ^ MASK[6], keys2[7] ^ MASK[7],
      randByte(), randByte(), randByte(), randByte(), randByte(),
      randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
      (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
    ];
    const [key21] = numarrAddTime([...der.keys[17]], Math.floor(Date.now() / 1000), Math.random());
    const requestData = encryptMode1(plain24, key21, 0);
    const body = [4, 0, 48, ...keys2, 32, ...requestData];
    const crc = crc32b(Buffer.from(body));
    return 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64);
  }

  // 明文标记位置
  const marks = [];
  for (let k = 0; k * 16 + 24 < cap.length; k++) marks.push(24 + k * 16);
  const formulaBase = b86.slice(2, 2 + cap.length);
  const formulaCDPMark = [...formulaBase];
  for (const mp of marks) formulaCDPMark[mp] = cap[mp];

  // 明文 vs b86 差异
  const d1 = [];
  for (let i = 0; i < cap.length; i++) if (formulaBase[i] !== cap[i]) d1.push(i);
  console.log('明文 vs 公式差异:', d1.length, d1.join(','));
  console.log('明文[25-28]:', cap.slice(25, 29).join(','), '公式[25-28]:', formulaBase.slice(25, 29).join(','));

  const variants = {
    'A_最终明文167': [...cap],
    'B_公式b86+标记CDP': [...formulaCDPMark],
    'C_589base': [...base589],
  };
  for (const [name, nb] of Object.entries(variants)) {
    try {
      const newP = buildCookie(nb);
      const q1 = genQuery(API);
      const url1 = 'https://pmos.nx.sgcc.com.cn:10443' + API + '?' + q1;
      runCurl(url1, q1, oCookie + '; ' + p.name + '=' + newP, name);
      await new Promise(r2 => setTimeout(r2, 1500));
    } catch (e) { console.log(name + ' 构造失败:', e.message.substring(0, 100)); }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
