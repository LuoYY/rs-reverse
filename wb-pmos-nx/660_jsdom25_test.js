/**
 * 660_jsdom25_test.js
 * 决定性：同 nsd/cd 下，用 jsdom basearr[25-28] 替换浏览器 basearr[25-28]（其他保持浏览器）
 * 第一次请求测服务器——若 200 → [25-28] 不校验精确值（纯算法可行！）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { execSync } = require('child_process');
const { JSDOM } = require('jsdom');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const API = '/px-common-authcenter/auth/v2/captcha/get';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const PROXY = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

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

function runCurl(apiUrl, hdrQ, cookieStr, label) {
  try {
    const curlCmd = `curl -s -o /tmp/660_api.html -w "%{http_code}" -x "${PROXY}" --max-time 20 '${apiUrl}' \
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
    const code = execSync(curlCmd, { timeout: 30000 }).toString().trim();
    const body = fs.readFileSync('/tmp/660_api.html', 'utf8');
    console.log(label + ':', code, body.substring(0, 40).replace(/\n/g, ' '));
  } catch (e) {
    console.log(label + ': err', (e.stdout || '').toString().trim().substring(0, 40));
  }
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
function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
const encCfg = getEncCfg(getTree());

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  const oCookie = ch.setCookies.find(c => /O=/.test(c)) || '';
  console.log('nsd=' + ts.nsd);

  // 浏览器采集
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 15000));
  const ck = await context.cookies();
  const pB = ck.find(c => c.name.endsWith('P'));
  const envB = await page.evaluate(() => {
    const out = {
      lang: navigator.language, langs: Array.from(navigator.languages || []), hw: navigator.hardwareConcurrency,
      maxTP: navigator.maxTouchPoints, vendor: navigator.vendor, platform: navigator.platform,
      tz: new Date().getTimezoneOffset(), evalLen: eval.toString().length,
      innerW: innerWidth, innerH: innerHeight, outerW: outerWidth, outerH: outerHeight,
      scrW: screen.width, scrH: screen.height, colorDepth: screen.colorDepth, dpr: devicePixelRatio,
    };
    try { const c2 = document.createElement('canvas'); c2.width = 200; c2.height = 60; const ctx = c2.getContext('2d'); ctx.font = '14px Arial'; ctx.fillText('Test 123', 5, 20); out.canvasDataURL = c2.toDataURL(); } catch (e) {}
    return out;
  }).catch(() => null);
  await browser.close();

  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const gv = require(path.join(ROOT, 'src/handler/globalVarible'));
  gv.cache = gv.cache || {};
  gv.cache.config = { adapt: { cdBasestr: NX_BS } };
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode2, encryptMode1 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const numarr2string = require(path.join(ROOT, 'src/handler/parser/common/numarr2string'));
  const numToNumarr4 = require(path.join(ROOT, 'src/handler/parser/common/numToNumarr4'));
  const uuidFn = require(path.join(ROOT, 'src/handler/parser/common/uuid'));
  const B86_64 = NX_BS.slice(0, 64);
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

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
  function nxEncrypt(numarr) {
    const ans = [];
    const len = numarr.length;
    let one = 0, two = 0;
    const pad = 0x68;
    for (let i = 0; i < len; i++) {
      const cfg = encCfg[numarr[i]];
      one = one << cfg.val | cfg.key;
      two += cfg.val;
      while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
    }
    if (two > 0) ans.push(one << 8 - two | pad >> two);
    return ans;
  }
  function huffmanDecodeRaw(enc) {
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

  function reverseBasearr(pVal) {
    const dec = encryptMode2([...decodeB86(pVal.slice(1))], keys16arr, 1);
    const na = dec.slice(4);
    const beLen = (na[59] & 0x7f) << 8 | na[60];
    const be = na.slice(61, 61 + beLen);
    const keys2 = na.slice(11, 59);
    const tmp = encryptMode2([...be], numarrAddTime([...der.keys[17]], 0, 1 / 256)[0], 0);
    const huff = tmp.map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
    const raw = huffmanDecodeRaw(huff);
    let bestLen = 0;
    const huffHead = huff.slice(0, huff.length - 1);
    for (let L = raw.length; L >= 1; L--) {
      const enc = nxEncrypt(raw.slice(0, L));
      if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
    }
    return raw.slice(0, bestLen);
  }
  const bB = pB ? reverseBasearr(pB.value) : null;
  console.log('浏览器 basearr len:', bB ? bB.length : '无', 'B[25-28]:', bB ? bB.slice(25, 29).map(x => x.toString(16).padStart(2, '0')).join(' ') : '');

  // jsdom 生成 basearr
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };
  const envI = envB || { lang: 'zh-CN', langs: ['zh-CN'], hw: 8, maxTP: 0, vendor: 'Google Inc.', platform: 'MacIntel', tz: -480, evalLen: 33, innerW: 1920, innerH: 1080, outerW: 1920, outerH: 1080, scrW: 1920, scrH: 1080, colorDepth: 24, dpr: 1 };
  try {
    const nav = window.navigator;
    const def = (k, v) => { try { Object.defineProperty(nav, k, { value: v, configurable: true }); } catch (e) {} };
    def('language', envI.lang); def('languages', envI.langs); def('hardwareConcurrency', envI.hw);
    def('maxTouchPoints', envI.maxTP); def('vendor', envI.vendor); def('platform', envI.platform);
    def('appName', 'Netscape'); def('appCodeName', 'Mozilla'); def('product', 'Gecko'); def('productSub', '20030107');
    const scr = window.screen;
    ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth'].forEach(k => {
      const v = k.includes('Height') ? (k === 'colorDepth' || k === 'pixelDepth' ? 24 : envI.scrH) : (k === 'colorDepth' || k === 'pixelDepth' ? 24 : envI.scrW);
      try { Object.defineProperty(scr, k, { value: v, configurable: true }); } catch (e) {}
    });
    def('devicePixelRatio', envI.dpr);
    if (envI.canvasDataURL) {
      try {
        window.HTMLCanvasElement.prototype.toDataURL = function () { return envI.canvasDataURL; };
        window.HTMLCanvasElement.prototype.getContext = function (type) {
          if (String(type) === '2d') return { fillRect() {}, clearRect() {}, getImageData() { return { data: new Uint8ClampedArray([0, 0, 0, 0]) }; }, drawImage() {}, fillText() {}, measureText() { return { width: 10 }; }, save() {}, restore() {}, translate() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, canvas: this, toDataURL: function () { return envI.canvasDataURL; } };
          return null;
        };
      } catch (e) {}
    }
  } catch (e) {}

  window.__pureTrap = [];
  window.__origPush = window.Array.prototype.push;
  window.Array.prototype.push = function () {
    const r = window.__origPush.apply(this, arguments);
    const l = this.length;
    if (l >= 150 && l <= 185 && this.every(x => typeof x === 'number')) {
      window.__pureTrap.push(Array.from(this));
    }
    return r;
  };
  const cookiesWritten = [];
  let cookieJar = '';
  Object.defineProperty(window.document, 'cookie', {
    get() { return cookieJar; },
    set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
    configurable: true,
  });
  window.addEventListener('error', () => {});
  try { window.eval(outerJsCode); } catch (e) {}
  await new Promise(r => setTimeout(r, 15000));
  const jArr = window.__pureTrap.length ? window.__pureTrap[0] : null;
  console.log('jsdom basearr len:', jArr ? jArr.length : '无', 'J[25-28]:', jArr ? jArr.slice(25, 29).map(x => x.toString(16).padStart(2, '0')).join(' ') : '');

  function crc32b(buf) {
    let c = ~0;
    for (const d of buf) { c ^= d; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    return ~c >>> 0;
  }
  const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
  const randByte = () => Math.floor(Math.random() * 256);
  function genQuery(urlPath) {
    const cu = crc32b(Buffer.from(urlPath.toUpperCase()));
    const plain24 = [
      der.keys[2][0] ^ MASK[0], der.keys[2][1] ^ MASK[1], der.keys[2][2] ^ MASK[2], der.keys[2][3] ^ MASK[3],
      der.keys[2][4] ^ MASK[4], der.keys[2][5] ^ MASK[5], der.keys[2][6] ^ MASK[6], der.keys[2][7] ^ MASK[7],
      randByte(), randByte(), randByte(), randByte(), randByte(),
      randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
      (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
    ];
    const [key21] = numarrAddTime([...der.keys[17]], Math.floor(Date.now() / 1000), Math.random());
    const requestData = encryptMode1(plain24, key21, 0);
    const body = [4, 0, 48, ...der.keys[2], 32, ...requestData];
    const crc = crc32b(Buffer.from(body));
    return 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64);
  }
  function buildCookie(newBase) {
    const huffA = nxEncrypt(newBase);
    const xorNew = [...huffA];
    for (let i = 0; i < 16; i++) xorNew[i] ^= der.keys[2][i];
    const now = Math.floor(Date.now() / 1000);
    const nt = numarrAddTime([...der.keys[17]], now, Math.random())[0];
    const beNew = encryptMode1(xorNew, nt, 0);
    const newNa = [
      4, 8, ...numToNumarr4(now), ...numToNumarr4(now), 48, ...der.keys[2],
      (beNew.length >> 8 & 255) | 128, beNew.length & 255, ...beNew,
    ];
    const u4 = numToNumarr4(uuidFn(newNa));
    return 'a' + numarr2string(encryptMode1([...u4, ...newNa], keys16arr, 1), B86_64);
  }

  // 变体（不同 path + 第一次请求）
  const tests = [];
  if (bB) tests.push(['A浏览器原样', [...bB], API]);
  if (bB && jArr) {
    const nb = [...bB];
    for (let i = 24; i < 29; i++) nb[i] = jArr[i];
    tests.push(['B浏览器+jsdom[24-28]', nb, '/px-gateway/GatewayConfig/getGatewayConfig']);
  }
  for (const [name, nb, pth] of tests) {
    try {
      const newP = buildCookie(nb);
      const q = genQuery(pth);
      const url = 'https://pmos.nx.sgcc.com.cn:10443' + pth + '?' + q;
      runCurl(url, q, oCookie + '; ' + pB.name + '=' + newP, name);
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) { console.log(name + ' 构造失败:', e.message.substring(0, 60)); }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
