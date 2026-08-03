/**
 * 533_env_capture_compare.js
 * 系统对比 jsdom vs 浏览器环境值（分析用）：
 * 采集浏览器环境值（canvas hash/webgl/screen/navigator）→ jsdom 注入 → basearr 前 24 对比
 * 判断 basearr 指纹段（0-23）依赖哪些环境值
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

  // 1. 浏览器环境值采集（分析用）
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const envB = await page.evaluate(() => {
    const nav = navigator;
    const scr = screen;
    const out = {
      ua: nav.userAgent, platform: nav.platform, language: nav.language, languages: Array.from(nav.languages || []),
      hardwareConcurrency: nav.hardwareConcurrency, deviceMemory: nav.deviceMemory, maxTouchPoints: nav.maxTouchPoints,
      vendor: nav.vendor, webdriver: nav.webdriver, productSub: nav.productSub, cookieEnabled: nav.cookieEnabled,
      onLine: nav.onLine, appVersion: nav.appVersion, appName: nav.appName, appCodeName: nav.appCodeName,
      product: nav.product, pdfViewerEnabled: nav.pdfViewerEnabled,
      screenW: scr.width, screenH: scr.height, availW: scr.availWidth, availH: scr.availHeight, colorDepth: scr.colorDepth,
      pixelDepth: scr.pixelDepth, devicePixelRatio: window.devicePixelRatio, innerW: innerWidth, innerH: innerHeight,
      outerW: outerWidth, outerH: outerHeight, screenX: screenX, screenY: screenY,
      timezone: new Date().getTimezoneOffset(),
      evalLen: eval.toString().length, fnLen: Function.prototype.toString.call(eval).length,
    };
    try {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('hello world 123456', 2, 2);
      const d = ctx.getImageData(0, 0, 100, 50).data;
      let h = 0;
      for (let i = 0; i < Math.min(d.length, 1000); i += 4) h = (h * 31 + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7 + d[i + 3]) & 0xffffffff;
      out.canvasHash = h >>> 0;
      out.canvasDataPrefix = Array.from(d.slice(0, 40)).join(',');
    } catch (e) { out.canvasErr = String(e).substring(0, 60); }
    try {
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        out.webglVendor = gl.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : 7937);
        out.webglRenderer = gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : 7938);
      } else out.webglErr = 'no webgl';
    } catch (e) { out.webglErr = String(e).substring(0, 60); }
    return out;
  });
  console.log('\n=== 浏览器环境值 ===');
  for (const [k, v] of Object.entries(envB)) console.log(k + ':', v === undefined ? 'undefined' : (typeof v === 'string' ? v.substring(0, 80) : JSON.stringify(v)));
  fs.writeFileSync('/tmp/env_browser.json', JSON.stringify(envB));

  // 2. jsdom 环境值（默认）
  const dom0 = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: TARGET, contentType: 'text/html', userAgent: UA, runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const envJ = await new Promise((resolve) => {
    try {
      const w = dom0.window;
      const out = {
        ua: w.navigator.userAgent, platform: w.navigator.platform, language: w.navigator.language,
        languages: Array.from(w.navigator.languages || []), hardwareConcurrency: w.navigator.hardwareConcurrency,
        deviceMemory: w.navigator.deviceMemory, maxTouchPoints: w.navigator.maxTouchPoints, vendor: w.navigator.vendor,
        evalLen: w.eval.toString().length, screenW: w.screen.width, screenH: w.screen.height,
        colorDepth: w.screen.colorDepth, devicePixelRatio: w.devicePixelRatio, innerW: w.innerWidth, innerH: w.innerHeight,
      };
      resolve(out);
    } catch (e) { resolve({ err: String(e) }); }
  });
  console.log('\n=== jsdom 环境值（默认） ===');
  for (const [k, v] of Object.entries(envJ)) console.log(k + ':', v === undefined ? 'undefined' : (typeof v === 'string' ? v.substring(0, 80) : JSON.stringify(v)));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
