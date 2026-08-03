/**
 * 630_decompile_basearr.js
 * 提取 nx 外层 VM 的 bytecode 池 + 反编译 basearr 生成子程序
 * 外层 VM 结构：_$kv/_$kz 解释器执行 _$_$[N] bytecode，_$hY 反编译 bytecode→JS
 * 628 号调用栈：basearr 由 eval:6 的代码构造（外层 JS 第 6 行区域）
 */
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

  // ★ hook：捕获外层 VM 运行时的全局变量（_$_$ 数组 + 解释器状态）
  window.__captured = {};
  const origEval = window.eval;
  window.eval = function (s) {
    const r = origEval.apply(this, arguments);
    // 运行后捕获全局 _$_$
    try {
      if (window._$_$ && Array.isArray(window._$_$) && !window.__captured._$_$) {
        window.__captured._$_$ = window._$_$;
      }
    } catch (e) {}
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
  const pJ = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('jsdom P cookie:', pJ ? 'YES' : '无');

  // 提取 _$_$
  const tsPool = window.__captured._$_$;
  console.log('_$_$ type:', tsPool ? Array.isArray(tsPool) ? 'array len=' + tsPool.length : typeof tsPool : '无');
  if (tsPool && Array.isArray(tsPool)) {
    for (let i = 0; i < Math.min(tsPool.length, 10); i++) {
      const v = tsPool[i];
      if (Array.isArray(v)) console.log(`  _$_$[${i}]: array len=${v.length} 头=${v.slice(0, 20).join(',')}`);
      else console.log(`  _$_$[${i}]: ${typeof v}`);
    }
  }
  // 也 dump window 上所有数组（找 bytecode 池）
  const arrays = [];
  for (const k of Object.getOwnPropertyNames(window)) {
    try {
      const v = window[k];
      if (Array.isArray(v) && v.length > 50 && v.every(x => typeof x === 'number')) {
        arrays.push({ name: k, len: v.length, head: v.slice(0, 10).join(',') });
      }
    } catch (e) {}
  }
  console.log('数字数组:', arrays.length);
  arrays.slice(0, 15).forEach(a => console.log(`  ${a.name}: len=${a.len} 头=[${a.head}]`));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
