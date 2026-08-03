/**
 * 509_env_sensitivity.js
 * jsdom 环境值敏感性实验：改 UA/screen/canvas 返回值 → 观察稳定段（dec 65-80）变化
 * 定位稳定段依赖的环境（若某环境影响稳定段 → 可模拟）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

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

function runJsdom(ts, outerJsCode, envPatch) {
  return new Promise((resolve) => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
      runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
    });
    const { window } = dom;
    window.$_ts = { nsd: ts.nsd, cd: ts.cd };
    if (envPatch) envPatch(window);
    const cookiesWritten = [];
    let cookieJar = '';
    Object.defineProperty(window.document, 'cookie', {
      get() { return cookieJar; },
      set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
      configurable: true,
    });
    window.addEventListener('error', () => {});
    try { window.eval(outerJsCode); } catch (e) {}
    setTimeout(() => {
      const p = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
      resolve(p ? p.split('=')[1] : null);
    }, 12000);
  });
}

async function getStable(ts, arr, enc2, outerJsCode) {
  const p = await runJsdom(ts, outerJsCode, null);
  if (!p) return null;
  const dec = enc2([...decodeB86(p.slice(1))], arr, 1);
  return dec.slice(65, 81);
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);

  try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

  // 基线（jsdom 默认）
  const base = await getStable(ts, arr, encryptMode2, outerJsCode);
  console.log('基线稳定段:', base ? base.map(b => b.toString(16).padStart(2, '0')).join(' ') : '无 cookie');

  // 变体实验
  const variants = {
    'screen 改 1366x768': (w) => {
      const s = w.screen;
      ['width', 'height', 'availWidth', 'availHeight'].forEach((k) => { try { Object.defineProperty(s, k, { value: k.includes('Height') ? 768 : 1366, configurable: true }); } catch (e) {} });
    },
    'navigator 改 hardwareConcurrency=4': (w) => {
      try { Object.defineProperty(w.navigator, 'hardwareConcurrency', { value: 4, configurable: true }); } catch (e) {}
    },
    'navigator 改 deviceMemory=4': (w) => {
      try { Object.defineProperty(w.navigator, 'deviceMemory', { value: 4, configurable: true }); } catch (e) {}
    },
    'canvas 2d getImageData 改': (w) => {
      try {
        const origGC = w.HTMLCanvasElement.prototype.getContext;
        w.HTMLCanvasElement.prototype.getContext = function (type, attrs) {
          const t = String(type || '');
          if (t === '2d') return { fillRect() {}, clearRect() {}, getImageData() { return { data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]) }; }, drawImage() {}, fillText() {}, measureText() { return { width: 10 }; }, save() {}, restore() {}, translate() {}, beginPath() {}, arc() {}, fill() {}, stroke() {} };
          return origGC ? origGC.apply(this, arguments) : null;
        };
      } catch (e) {}
    },
  };

  for (const [name, patch] of Object.entries(variants)) {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
      runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
    });
    const { window } = dom;
    window.$_ts = { nsd: ts.nsd, cd: ts.cd };
    patch(window);
    const cookiesWritten = [];
    let cookieJar = '';
    Object.defineProperty(window.document, 'cookie', {
      get() { return cookieJar; },
      set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
      configurable: true,
    });
    window.addEventListener('error', () => {});
    try { window.eval(outerJsCode); } catch (e) {}
    await new Promise(r => setTimeout(r, 12000));
    const p = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
    if (p) {
      const dec = encryptMode2([...decodeB86(p.split('=')[1].slice(1))], arr, 1);
      const seg = dec.slice(65, 81);
      const diff = base ? seg.map((b, i) => b === base[i]).filter(Boolean).length : 0;
      console.log(`${name}: ${seg.map(b => b.toString(16).padStart(2, '0')).join(' ')} 与基线相同 ${diff}/16`);
    } else {
      console.log(name + ': 无 cookie');
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
