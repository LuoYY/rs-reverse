/**
 * 97_jsdom_online_cookie.js
 *
 * 纯 jsdom 在线验证：代理拉挑战 → jsdom（完整环境）生成 P cookie → 代理重放 200?
 * 若 200 → jsdom 纯算法直接可用；若 412 → 分析原因。
 *
 * 用法：node 97_jsdom_online_cookie.js [轮数]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@119.167.233.189:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

function httpsGetWithProxy(url, cookieH) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR', error: 'CONNECT ' + res.statusCode }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        const head = `GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\n${cookieH ? `Cookie: ${cookieH}\r\n` : ''}Connection: close\r\n\r\n`;
        tlsSock.write(head);
      });
      let body = '';
      tlsSock.on('data', d => body += d);
      tlsSock.on('end', () => {
        const headEnd = body.indexOf('\r\n\r\n');
        if (headEnd < 0) { resolve({ status: 'ERR', error: 'bad response' }); return; }
        const head = body.substring(0, headEnd);
        const status = parseInt((head.split(' ')[1] || '').trim());
        const setCookies = [];
        head.split('\r\n').forEach(l => { const m = l.match(/^set-cookie:\s*(.+)$/i); if (m) setCookies.push(m[1]); });
        resolve({ status, headers: { 'set-cookie': setCookies }, body: body.substring(headEnd + 4) });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'ERR', error: 'TIMEOUT' }); });
    connectReq.end();
  });
}

function makeDom(nsd, cd, oCookie) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
    beforeParse(window) {
      const ctx = new Proxy({}, {
        get(t, p) {
          if (p === 'canvas') return { width: 300, height: 150 };
          if (p === 'measureText') return (text) => ({ width: (text || '').length * 7 });
          if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
          if (p === 'createPattern') return () => ({});
          if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
          if (p === 'putImageData' || p === 'drawImage') return () => {};
          return () => {};
        },
      });
      if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype) {
        window.HTMLCanvasElement.prototype.getContext = function () { return ctx; };
        window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,iVBORw0KGgo='; };
      }
      if (window.WebGLRenderingContext) {
        window.HTMLCanvasElement.prototype.getContext = function (type) {
          if (String(type).includes('webgl')) {
            return new Proxy({}, { get: (t, p) => { if (p === 'getParameter') return () => null; if (p === 'getExtension') return () => null; return typeof p === 'string' ? () => ({}) : undefined; } });
          }
          return ctx;
        };
      }
      if (window.OfflineAudioContext) {
        window.OfflineAudioContext = function () { return { startRendering: () => Promise.resolve({ getChannelData: () => new Float32Array(1) }), createOscillator: () => ({ connect() {}, start() {}, frequency: {} }), createDynamicsCompressor: () => ({ connect() {}, threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }), destination: {} }; };
      }
      if (window.AudioContext) window.AudioContext = window.OfflineAudioContext;
      for (const [name, ctor] of [
        ['ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }],
        ['IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }],
        ['Worker', function () { this.postMessage = () => {}; this.terminate = () => {}; this.addEventListener = () => {}; this.onmessage = null; }],
        ['Path2D', function () {}],
        ['DOMMatrix', function () { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, m11: 1, m12: 0, m21: 0, m22: 1, m41: 0, m42: 0 }; }],
        ['DOMPoint', function (x, y, z, w) { return { x: x || 0, y: y || 0, z: z || 0, w: w || 1 }; }],
      ]) {
        if (!window[name]) { try { window[name] = ctor; } catch (e) {} }
      }
      if (!window.TextEncoder && globalThis.TextEncoder) window.TextEncoder = globalThis.TextEncoder;
      if (!window.TextDecoder && globalThis.TextDecoder) window.TextDecoder = globalThis.TextDecoder;
    },
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  const cookies = [];
  let cj = oCookie;
  Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cookies.push(v); cj = cj ? cj + '; ' + v : v; }, configurable: true });
  return { dom, window, cookies };
}

async function main() {
  const rounds = parseInt(process.argv[2] || '3');
  let ok = 0;
  for (let i = 1; i <= rounds; i++) {
    console.log(`\n========== 会话 ${i}/${rounds} ==========`);
    const ch = await httpsGetWithProxy(TARGET);
    if (ch.status === 'ERR' || ch.status !== 412) { console.log('挑战页:', ch.status, ch.error || ''); continue; }
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) { console.log('无 $_ts'); continue; }
    const nsd = +m[1], cd = m[2];
    const setCookies = [].concat(ch.headers['set-cookie'] || []);
    const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
    console.log('nsd=' + nsd + ' cdLen=' + cd.length + ' O=' + (oCookie || 'N/A').substring(0, 20) + '...');

    const { window, cookies } = makeDom(nsd, cd, oCookie);
    const jsdomErrs = [];
    window.addEventListener('error', (e) => { jsdomErrs.push(String(e.error || e.message || '').substring(0, 80)); });
    try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 25000)); } catch (e) { console.log('外层错误:', e.message.substring(0, 60)); }
    const pCookie = cookies.map(c => c.split(';')[0]).find(c => /P=/.test(c));
    console.log('jsdom 错误数:', jsdomErrs.length, 'P cookie:', pCookie ? 'len=' + pCookie.split('=')[1].length : '无');
    if (!pCookie) { continue; }

    // 重放验证
    const cookieH = `${oCookie}; ${pCookie}`;
    const resp = await httpsGetWithProxy(TARGET, cookieH);
    console.log('重放 →', resp.status, resp.status === 200 ? '★★★ 200! jsdom cookie 可用!' : '');
    console.log('  Cookie:', cookieH.substring(0, 60) + '...');
    if (resp.body) console.log('  body 前 150:', resp.body.substring(0, 150).replace(/\n/g, ' '));
    fs.writeFileSync(path.join(__dirname, 'captures', `jsdom_cookie_${Date.now()}.json`), JSON.stringify({ nsd, cd, oCookie, pCookie, status: resp.status }));
    if (resp.status === 200) ok++;
    window.close();
  }
  console.log(`\n===== 汇总: ${ok}/${rounds} 200 =====`);
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
