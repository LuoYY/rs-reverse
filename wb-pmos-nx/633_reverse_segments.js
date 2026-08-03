/**
 * 633_reverse_segments.js
 * xb 式逐段逆向：同 nsd/cd 下 jsdom basearr + 浏览器 basearr + keys 三方对照
 * 目标：定位 nx basearr 各段（环境段/keys段/绑定段）+ 推导公式
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { JSDOM } = require('jsdom');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

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
function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
let huffEncCfg = null;
function numarrEncrypt68(numarr) {
  if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
  const ans = [];
  const len = numarr.length;
  let one = 0, two = 0;
  const pad = 0x68;
  for (let i = 0; i < len; i++) {
    const cfg = huffEncCfg[numarr[i]];
    one = one << cfg.val | cfg.key;
    two += cfg.val;
    while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
  }
  if (two > 0) ans.push(one << 8 - two | pad >> two);
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
function reverseBasearr(pVal, der, enc2, addTime) {
  const keys16arr = addTime([...K16], 0, 1 / 256)[0];
  const keys17arr = addTime([...der.keys[17]], 0, 1 / 256)[0];
  const dec = enc2([...decodeB86(pVal.slice(1))], keys16arr, 1);
  const na = dec.slice(4);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const tmp = enc2([...be], keys17arr, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ der.keys[2][i]) : v);
  numarrEncrypt68([]);
  function huffmanDecodeRaw(enc) {
    const byLen = {}; let maxL = 0;
    for (let idx = 0; idx < 256; idx++) {
      const c = huffEncCfg[idx];
      if (!c) continue;
      if (!byLen[c.val]) byLen[c.val] = {};
      byLen[c.val][c.key] = idx;
      if (c.val > maxL) maxL = c.val;
    }
    const ans = [];
    let key = 0, val = 0;
    for (let i = 0; i < enc.length; i++) {
      for (let b = 7; b >= 0; b--) {
        key = (key << 1) | ((enc[i] >> b) & 1);
        val++;
        const mm = byLen[val];
        if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
        if (val > maxL) { key = 0; val = 0; }
      }
    }
    return ans;
  }
  const raw = huffmanDecodeRaw(huff);
  let bestLen = 0;
  const huffHead = huff.slice(0, huff.length - 1);
  for (let L = raw.length; L >= 1; L--) {
    const enc = numarrEncrypt68(raw.slice(0, L));
    if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
  }
  return raw.slice(0, bestLen);
}

(async () => {
  try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));

  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战失败'); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);
  const der = deriveKeysFromCd(ts.cd);
  const k = der.keys;
  const k19n = +k[19].map(c => String.fromCharCode(c)).join('');
  const k21n = +k[21].map(c => String.fromCharCode(c)).join('');
  const flag = +k[24].map(c => String.fromCharCode(c)).join('');
  const k22str = k[22].map(c => String.fromCharCode(c)).join('');
  console.log('keys19:', k19n, 'keys21:', k21n, 'flag:', flag, 'keys22:', k22str.substring(0, 20));

  // 浏览器 basearr + 环境值
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await page.waitForTimeout(9000);
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
  const bB = pB ? reverseBasearr(pB.value, der, encryptMode2, numarrAddTime) : null;
  console.log('浏览器 basearr len:', bB ? bB.length : '无');

  // jsdom basearr
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
  } catch (e) { console.log('注入 err:', e.message.substring(0, 60)); }

  window.__pureTrap = [];
  window.__origPush = window.Array.prototype.push;
  window.Array.prototype.push = function () {
    const r = window.__origPush.apply(this, arguments);
    const l = this.length;
    if (l >= 150 && l <= 185 && this.every(x => typeof x === 'number')) {
      window.__pureTrap.push({ len: l, arr: Array.from(this) });
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
  try { window.eval(outerJsCode); } catch (e) { console.log('外层 eval err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 15000));
  const jArr = window.__pureTrap.length ? window.__pureTrap[0].arr : null;
  console.log('jsdom basearr len:', jArr ? jArr.length : '无');

  // 三方对照
  if (bB && jArr) {
    console.log('\n=== 浏览器 basearr ===');
    console.log(bB.map(x => x.toString(16).padStart(2, '0')).join(' '));
    console.log('\n=== jsdom basearr ===');
    console.log(jArr.map(x => x.toString(16).padStart(2, '0')).join(' '));
    // 找 jsdom 数组在浏览器中的子串匹配（段对齐）
    console.log('\n=== 子串匹配（jsdom 段 → 浏览器位置）===');
    for (let js = 0; js < jArr.length; js += 4) {
      for (let bs = 0; bs < bB.length; bs++) {
        let l = 0;
        while (js + l < jArr.length && bs + l < bB.length && jArr[js + l] === bB[bs + l]) l++;
        if (l >= 5) console.log(`J[${js}+${l}] == B[${bs}+${l}]`);
      }
    }
  }
  fs.writeFileSync('/tmp/nx_633_data.json', JSON.stringify({ bB, jArr, keys: k.map(x => x ? Array.from(x) : null), k19n, k21n, flag, env: envB }));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
