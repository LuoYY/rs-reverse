/**
 * 631_hook_hY.js
 * hook 外层 VM 的 _$hY（Coder/反编译器）记录调用
 * 定位 basearr 生成子程序（输出数组 len 150-180）
 * 方法：替换外层 JS 第 7 行 _$hY 定义，注入 window.__hYlog
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
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战失败'); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);

  // 浏览器环境值
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await page.waitForTimeout(9000);
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

  // 读外层 JS，替换第 7 行 _$hY 定义（注入记录）
  const lines = fs.readFileSync(OUTER_JS, 'utf8').split('\n');
  console.log('总行数:', lines.length);
  const line7 = lines[6] || '';
  console.log('第 7 行 len:', line7.length);
  // 在 _$hY 函数体开头注入记录
  // _$hY 定义: function _$hY(_$om,_$a8,_$n5){function _$cO(){...}var _$aS;...}
  // 注入: window.__hYlog.push({om:_$om, len:_$a8?._$a8.length})
  const inject = 'window.__hYlog=window.__hYlog||[];window.__hYlog.push({om:' + '_$om' + ',n5:' + '_$n5' + ',outLen:(' + '_$a8' + '&&' + '_$a8' + '.length)||0});';
  const newLine7 = line7.replace(/\{function _\$cO\(\)/, '{' + inject + 'function _$cO()');
  if (newLine7 === line7) {
    console.log('注入失败（未找到 _$cO）');
  } else {
    console.log('注入成功');
  }
  lines[6] = newLine7;
  const patchedJs = lines.join('\n');

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };
  window.__hYlog = [];
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

  // 数组陷阱（捕获 basearr）
  window.__arrTrap = [];
  window.__origPush = window.Array.prototype.push;
  window.Array.prototype.push = function () {
    const r = window.__origPush.apply(this, arguments);
    const l = this.length;
    if (l >= 150 && l <= 180) {
      const arr = [];
      for (let i = 0; i < this.length; i++) arr.push(typeof this[i] === 'number' ? this[i] : null);
      window.__arrTrap.push({ len: l, arr, stack: new Error().stack ? String(new Error().stack).substring(0, 800) : '' });
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
  try { window.eval(patchedJs); } catch (e) { console.log('外层 eval err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 15000));

  console.log('_$hY 调用数:', window.__hYlog.length);
  // 找输出 len 150-180 的调用
  const cands = window.__hYlog.filter(x => x.outLen >= 150 && x.outLen <= 180);
  console.log('basearr 候选（outLen 150-180）:', cands.length);
  cands.slice(0, 10).forEach(c => console.log(`  om=${c.om} n5=${c.n5} outLen=${c.outLen}`));
  // 输出所有调用（前 50）
  console.log('\n全部调用（前 60）:');
  window.__hYlog.slice(0, 60).forEach((c, i) => console.log(`  #${i} om=${c.om} n5=${c.n5} outLen=${c.outLen}`));
  fs.writeFileSync('/tmp/nx_hYlog.json', JSON.stringify(window.__hYlog));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
