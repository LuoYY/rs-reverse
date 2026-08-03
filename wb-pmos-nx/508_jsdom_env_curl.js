/**
 * 508_jsdom_env_curl.js
 * jsdom（patchEnv2 系统补环境，API 报错消除）+ Node query → curl 200/400?
 * 判断稳定段（环境指纹）是否服务器校验
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

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const PROXY = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];

// [复用 506 号的 patchEnv2]
function patchEnv2(window) {
  try {
    const APIs = ['AudioContext', 'webkitAudioContext', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'OfflineAudioContext',
      'MediaRecorder', 'SpeechRecognition', 'webkitSpeechRecognition', 'SpeechSynthesis', 'webkitSpeechSynthesis',
      'Notification', 'SharedWorker', 'ServiceWorker', 'WebSocket', 'Worker', 'caches', 'Request', 'Response',
      'Headers', 'URL', 'URLSearchParams', 'FileReader', 'FormData', 'Blob', 'File', 'Image', 'Option',
      'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'AbortController', 'EventSource',
      'FontFace', 'TextDecoder', 'TextEncoder', 'MessageChannel', 'BroadcastChannel', 'customElements', 'IDBFactory'];
    for (const k of APIs) {
      if (!window[k]) { try { window[k] = function () {}; } catch (e) {} }
    }
    const protoMethods = ['appendChild', 'removeChild', 'insertBefore', 'replaceChild', 'cloneNode', 'addEventListener',
      'removeEventListener', 'dispatchEvent', 'getAttribute', 'setAttribute', 'removeAttribute', 'hasAttribute',
      'getBoundingClientRect', 'getClientRects', 'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByTagName',
      'getElementsByClassName', 'matches', 'closest', 'contains', 'focus', 'blur', 'click', 'scrollIntoView',
      'createElement', 'createTextNode', 'createDocumentFragment', 'createEvent', 'createRange', 'execCommand'];
    for (const protoName of ['HTMLDocument', 'Document', 'Element', 'HTMLElement', 'Node', 'Window']) {
      const proto = window[protoName] && window[protoName].prototype;
      if (!proto) continue;
      for (const mn of protoMethods) {
        if (typeof proto[mn] !== 'function') {
          try { proto[mn] = function () { return mn === 'getBoundingClientRect' ? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } : (mn.startsWith('get') && !mn.startsWith('getElement') && !mn.startsWith('getElements') ? null : this); }; } catch (e) {}
        }
      }
    }
    try {
      if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype) {
        const origGC = window.HTMLCanvasElement.prototype.getContext;
        window.HTMLCanvasElement.prototype.getContext = function (type, attrs) {
          const t = String(type || '');
          if (t === 'webgl' || t === 'experimental-webgl') return null;
          if (t === '2d') return { fillRect() {}, clearRect() {}, getImageData() { return { data: new Uint8ClampedArray([0, 0, 0, 0]) }; }, drawImage() {}, fillText() {}, measureText() { return { width: 0 }; }, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, createLinearGradient() { return { addColorStop() {} }; }, setTransform() {}, transform() {}, canvas: this, toDataURL() { return ''; } };
          return origGC ? origGC.apply(this, arguments) : null;
        };
      }
    } catch (e) {}
    try {
      const nav = window.navigator;
      const def = (k, v) => { if (nav[k] === undefined) { try { Object.defineProperty(nav, k, { value: v, configurable: true }); } catch (e) {} } };
      def('language', 'zh-CN'); def('languages', ['zh-CN', 'zh']); def('platform', 'MacIntel');
      def('hardwareConcurrency', 8); def('deviceMemory', 8); def('maxTouchPoints', 0);
      def('vendor', 'Google Inc.'); def('webdriver', false); def('onLine', true); def('cookieEnabled', true);
      def('productSub', '20030107'); def('product', 'Gecko'); def('vendorSub', ''); def('appCodeName', 'Mozilla');
      def('appName', 'Netscape'); def('userAgent', UA);
      if (typeof nav.sendBeacon !== 'function') nav.sendBeacon = function () { return true; };
      if (typeof nav.getBattery !== 'function') nav.getBattery = function () { return Promise.resolve({ charging: true, level: 1 }); };
      if (typeof nav.getGamepads !== 'function') nav.getGamepads = function () { return []; };
      if (typeof nav.vibrate !== 'function') nav.vibrate = function () { return true; };
    } catch (e) {}
    try {
      ['postMessage', 'requestAnimationFrame', 'cancelAnimationFrame', 'getSelection', 'matchMedia', 'scrollTo',
        'scrollBy', 'open', 'close', 'print', 'alert', 'confirm', 'prompt', 'atob', 'btoa', 'requestIdleCallback',
        'queueMicrotask', 'structuredClone', 'getComputedStyle'].forEach((mn) => {
        if (typeof window[mn] !== 'function') {
          try { window[mn] = function () { return mn === 'matchMedia' ? { matches: false, addListener() {}, removeListener() {} } : undefined; }; } catch (e) {}
        }
      });
      if (!window.performance) window.performance = { now: () => Date.now(), timing: { navigationStart: Date.now() }, memory: { usedJSHeapSize: 0 } };
      if (!window.screen) window.screen = {};
      const scr = window.screen;
      ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth'].forEach((k) => {
        if (scr[k] === undefined) { try { Object.defineProperty(scr, k, { value: k === 'colorDepth' || k === 'pixelDepth' ? 24 : (k.includes('Height') ? 1080 : 1920), configurable: true }); } catch (e) {} }
      });
    } catch (e) {}
  } catch (e) {}
}

// [复用 331 号的解密/加密工具]
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
  const arr = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && arr.push(d1[one] | d2[two]);
    three !== undefined && arr.push(d3[two] | d4[three]);
    four !== undefined && arr.push(d5[three] | d6[four]);
  }
  return arr;
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

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode1, encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const numarr2string = require(path.join(ROOT, 'src/handler/parser/common/numarr2string'));

  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  const oCookie = ch.setCookies.find(c => /O=/.test(c)) || '';
  console.log('nsd=' + ts.nsd);

  // jsdom + patchEnv2
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };
  patchEnv2(window);
  const cookiesWritten = [];
  let cookieJar = oCookie;
  Object.defineProperty(window.document, 'cookie', {
    get() { return cookieJar; },
    set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
    configurable: true,
  });
  const errs = [];
  window.addEventListener('error', (e) => { errs.push(String(e.error || e.message).substring(0, 60)); });
  try { window.eval(outerJsCode); } catch (e) {}
  await new Promise(r => setTimeout(r, 15000));
  const jsdomP = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  if (!jsdomP) { console.log('jsdom 未生成 P cookie'); process.exit(1); }
  const pCookie = jsdomP.split('=')[1];
  console.log('jsdom P len:', pCookie.length, 'errors:', [...new Set(errs)].slice(0, 4).join('|'));

  // 解密 keys2 + pureK17
  const cdArr = decryptCd(ts.cd);
  const der = deriveKeys(cdArr);
  const pureK17 = der.keys[17];
  const C = decodeB86(pCookie.slice(1));
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  const jsdomK2 = dec.slice(15, 63);
  console.log('jsdom keys2:', jsdomK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // Node 双 query
  const randByte = () => Math.floor(Math.random() * 256);
  function genQuery(urlPath) {
    const cu = crc32b(Buffer.from(urlPath.toUpperCase()));
    const plain24 = [
      jsdomK2[0] ^ MASK[0], jsdomK2[1] ^ MASK[1], jsdomK2[2] ^ MASK[2], jsdomK2[3] ^ MASK[3],
      jsdomK2[4] ^ MASK[4], jsdomK2[5] ^ MASK[5], jsdomK2[6] ^ MASK[6], jsdomK2[7] ^ MASK[7],
      randByte(), randByte(), randByte(), randByte(), randByte(),
      randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
      (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
    ];
    const [key21] = numarrAddTime([...pureK17], Math.floor(Date.now() / 1000), Math.random());
    const requestData = encryptMode1(plain24, key21, 0);
    const body = [4, 0, 48, ...jsdomK2, 32, ...requestData];
    const crc = crc32b(Buffer.from(body));
    return 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64.split(''));
  }

  const API = '/px-common-authcenter/auth/v2/captcha/get';
  const urlQ = genQuery(API);
  const hdrQ = genQuery(API);
  const cookieStr = oCookie + '; ' + jsdomP.split('=')[0] + '=' + pCookie;
  const API_URL = 'https://pmos.nx.sgcc.com.cn:10443' + API + '?' + urlQ;
  const curlCmd = `curl -s -o /tmp/508_api.html -w "%{http_code}" -x "${PROXY}" --max-time 20 '${API_URL}' \
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
    console.log('API:', code);
    const body = fs.readFileSync('/tmp/508_api.html', 'utf8');
    console.log('响应:', body.substring(0, 120).replace(/\n/g, ' '));
  } catch (e) {
    console.log('API err:', (e.stdout || '').toString().trim(), e.message.substring(0, 60));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
