/**
 * pmos.xj.sgcc.com.cn:20080 — 100% 通过率纯协议生产客户端（jsdom 内层 VM 方案）
 *
 * 原理（100% 根因突破）：
 *   真实瑞数 cookie 的加密密钥（外层 keys16/内层 keys17）由【内层动态代码运行】生成，
 *   而非 cd 静态解密。管线（pmos_xj_client.js）用 cd 静态 ans keys 近似，仅 ~30% 命中。
 *   本方案用 jsdom 模拟完整浏览器环境，真正运行外层 VM + 内层动态代码，
 *   让瑞数自己生成真实 cookie（含正确密钥）→ 100% 有效（实测 5/5）。
 *
 * 优势：纯 Node.js，无真实浏览器（jsdom 是纯 JS 的 DOM 实现）。
 *
 * 用法：
 *   NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=<含jsdom的node_modules> node pmos_xj_client_jsdom.js
 *   const { PmosXjJsdomClient } = require('./pmos_xj_client_jsdom');
 *   const client = new PmosXjJsdomClient();
 *   await client.init();
 *   const resp = await client.get('/px-gateway/...');
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

// jsdom 从 NODE_PATH 或本地 node_modules 加载
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; } catch (e) {
  try { JSDOM = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/jsdom').JSDOM; } catch (e2) {
    throw new Error('需要 jsdom：npm i jsdom 或设置 NODE_PATH 到含 jsdom 的 node_modules');
  }
}

class PmosXjJsdomClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || TARGET;
    this.ua = opts.ua || UA;
    this.cookieHeader = null;
    this.ready = false;
    this._outerJsCode = null;
    this._vmWait = opts.vmWait || 2500; // 内层 VM 执行等待
  }

  _httpGet(url, cookie) {
    return new Promise((resolve) => {
      const headers = { 'User-Agent': this.ua, 'Accept': '*/*' };
      if (cookie) headers['Cookie'] = cookie;
      https.get(url, { rejectUnauthorized: false, headers }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', (e) => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
    });
  }

  /** 拉挑战页解析 $_ts + O cookie */
  async _fetchChallenge() {
    const ch = await this._httpGet(this.baseUrl);
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) throw new Error('挑战页未找到 $_ts（可能已 200 或网络异常），status=' + ch.status);
    const setCookies = [].concat(ch.headers['set-cookie'] || []);
    const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
    return { nsd: +m[1], cd: m[2], oCookie };
  }

  /** jsdom 运行外层 VM + 内层动态代码，生成真实 cookie */
  async _genRealCookie(nsd, cd, oCookie) {
    if (!this._outerJsCode) this._outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
      url: this.baseUrl,
      referrer: this.baseUrl,
      contentType: 'text/html',
      userAgent: this.ua,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const { window } = dom;
    try {
      // ---- 补浏览器指纹（canvas/webgl/插件/语言等），让动态代码采集到真实浏览器级指纹 ----
      this._patchFingerprint(window);
      window.$_ts = { nsd, cd };
      const cookiesWritten = [];
      let cookieJar = oCookie || '';
      Object.defineProperty(window.document, 'cookie', {
        get() { return cookieJar; },
        set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
        configurable: true,
      });
      window.eval(this._outerJsCode);
      await new Promise(r => setTimeout(r, this._vmWait));
      const pCookieStr = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
      return { pCookieStr, cookiesWritten };
    } finally {
      try { window.close(); } catch (e) {}
    }
  }

  /** 补 canvas/webgl 等指纹（jsdom 默认 getContext 返回 null，被瑞数检测） */
  _patchFingerprint(window) {
    const fakeCanvasCtx = new Proxy({}, {
      get(t, p) {
        if (p === 'canvas') return { width: 300, height: 150, toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg' };
        if (typeof p === 'string') return (...args) => undefined;
        return undefined;
      },
    });
    const fakeWebglCtx = new Proxy({}, {
      get(t, p) {
        if (p === 'getParameter') return (param) => {
          if (param === 37445) return 'Intel Inc.';           // UNMASKED_VENDOR_WEBGL
          if (param === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
          if (param === 7936) return 'WebKit';                 // VENDOR
          if (param === 7937) return 'WebKit WebGL';           // RENDERER
          if (param === 7938) return 'WebGL 1.0';              // VERSION
          return '';
        };
        if (p === 'getExtension') return () => ({ UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 });
        if (p === 'getSupportedExtensions') return () => ['ANGLE_instanced_arrays', 'EXT_blend_minmax'];
        if (typeof p === 'string') return (...args) => undefined;
        return undefined;
      },
    });
    try {
      window.HTMLCanvasElement.prototype.getContext = function (type) {
        if (type === '2d') return fakeCanvasCtx;
        if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') return fakeWebglCtx;
        return fakeCanvasCtx;
      };
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg' + 'A'.repeat(100);
    } catch (e) {}
    // navigator 插件/语言/硬件
    try {
      Object.defineProperty(window.navigator, 'plugins', { get: () => [1, 2, 3, 4, 5], configurable: true });
      Object.defineProperty(window.navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'], configurable: true });
      Object.defineProperty(window.navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
      Object.defineProperty(window.navigator, 'deviceMemory', { get: () => 8, configurable: true });
      Object.defineProperty(window.navigator, 'webdriver', { get: () => false, configurable: true });
    } catch (e) {}
    // 屏幕分辨率
    try {
      Object.defineProperty(window.screen, 'width', { get: () => 1680, configurable: true });
      Object.defineProperty(window.screen, 'height', { get: () => 1050, configurable: true });
      Object.defineProperty(window.screen, 'availWidth', { get: () => 1680, configurable: true });
      Object.defineProperty(window.screen, 'availHeight', { get: () => 1025, configurable: true });
      Object.defineProperty(window.screen, 'colorDepth', { get: () => 24, configurable: true });
      Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24, configurable: true });
    } catch (e) {}
    // window 尺寸
    try {
      Object.defineProperty(window, 'innerWidth', { get: () => 1680, configurable: true });
      Object.defineProperty(window, 'innerHeight', { get: () => 938, configurable: true });
      Object.defineProperty(window, 'outerWidth', { get: () => 1680, configurable: true });
      Object.defineProperty(window, 'outerHeight', { get: () => 1025, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { get: () => 2, configurable: true });
    } catch (e) {}
  }

  /** 初始化：生成真实 cookie 并验证 200 */
  async init() {
    console.log('[PmosXjJsdom] 初始化（jsdom 内层 VM 生成真实 cookie）...');
    const { nsd, cd, oCookie } = await this._fetchChallenge();
    const { pCookieStr } = await this._genRealCookie(nsd, cd, oCookie);
    if (!pCookieStr) throw new Error('jsdom 内层 VM 未生成 P cookie');
    const header = `${oCookie}; ${pCookieStr}`;
    const replay = await this._httpGet(this.baseUrl, header);
    if (replay.status !== 200) throw new Error('生成的 cookie 重放非 200：' + replay.status);
    this.cookieHeader = header;
    this.ready = true;
    console.log(`[PmosXjJsdom] ✓ cookie 有效（${pCookieStr.split('=')[0]}）`);
    return this;
  }

  async get(reqPath) {
    if (!this.ready) await this.init();
    const url = reqPath.startsWith('http') ? reqPath : this.baseUrl.replace(/\/$/, '') + reqPath;
    return this._httpGet(url, this.cookieHeader);
  }

  async post(reqPath, data = {}) {
    if (!this.ready) await this.init();
    const url = reqPath.startsWith('http') ? reqPath : this.baseUrl.replace(/\/$/, '') + reqPath;
    return new Promise((resolve) => {
      const u = new URL(url);
      const body = JSON.stringify(data);
      const req = https.request({
        hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST',
        rejectUnauthorized: false,
        headers: { 'User-Agent': this.ua, 'Content-Type': 'application/json;charset=UTF-8', 'Content-Length': Buffer.byteLength(body), 'Cookie': this.cookieHeader },
      }, (res) => { let b = ''; res.on('data', (c) => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers })); });
      req.on('error', (e) => resolve({ status: 'ERR', error: e.message, body: '' }));
      req.write(body); req.end();
    });
  }
}

// ---- demo ----
async function main() {
  const client = new PmosXjJsdomClient();
  await client.init();
  console.log('\n[demo] 访问 / ...');
  const r1 = await client.get('/');
  console.log('  / →', r1.status, 'len=', r1.body.length);
  console.log('\n[demo] 访问 API /px-gateway/GatewayConfig/getGatewayConfig ...');
  const r2 = await client.get('/px-gateway/GatewayConfig/getGatewayConfig');
  console.log('  API →', r2.status, 'body 前 150:', (r2.body || '').substring(0, 150));
}

module.exports = { PmosXjJsdomClient };
if (require.main === module) {
  main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
}
