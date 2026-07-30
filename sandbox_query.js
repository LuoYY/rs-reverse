// Full sandbox: run outer VM + dynamic code with Z8XHJJY万能容错
// Goal: let RS hook XHR, then trigger XHR POST to capture query param generation
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const vm = require('vm');
const https = require('https');
const path = require('path');

const outerJs = fs.readFileSync(path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js'), 'utf8');

function httpGet(url) {
  return new Promise(r => {
    https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', e => r({ status: 'ERR', body: '' }));
  });
}

(async () => {
  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/');
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
  console.log('nsd:', nsd);

  const queryCapture = { value: null };
  const cookieCapture = [];

  // Z8XHJJY-style万能容错 Proxy: catches all property access, returns callable for anything
  // This is the KEY to making JSVMP dynamic code run without crashing
  function Z8XHJJY() { return Z8XHJJY; }
  Z8XHJJY.toString = function() { return 'function () { [native code] }'; };
  Z8XHJJY.valueOf = function() { return 0; };
  Z8XHJJY[Symbol.toPrimitive] = function() { return 0; };

  // Deep proxy: any property access returns a callable proxy that also has all properties
  function deepProxy(name) {
    const fn = function() { return deepProxy(name + '()'); };
    fn.toString = function() { return 'function () { [native code] }'; };
    fn.valueOf = function() { return 0; };
    return new Proxy(fn, {
      get(target, prop, receiver) {
        if (prop === 'length') return 0;
        if (prop === 'name') return '';
        if (prop === Symbol.toPrimitive) return function() { return ''; };
        if (prop === Symbol.iterator) return function*() {};
        if (prop in target) return target[prop];
        return deepProxy(name + '.' + String(prop));
      },
      has() { return true; },
      set(target, prop, val) { target[prop] = val; return true; },
      apply(target, thisArg, args) { return deepProxy(name + '()'); },
      construct(target, args) { return deepProxy(name + '.new'); },
    });
  }

  // XHR polyfill - must use prototype so RS can hook it
  function XHR() {}
  XHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
    timeout: 0, withCredentials: false,
    open: function(method, url) { this._method = method; this._url = String(url); this.readyState = 1; },
    send: function(body) {
      if (this._url) {
        var match = this._url.match(/r20SZOQm=([^&]+)/);
        if (match) { queryCapture.value = match[1]; queryCapture.url = this._url; queryCapture.method = this._method; }
      }
      this.readyState = 4; this.status = 200; this.responseText = '{"status":0,"message":"Success","data":{}}';
      this.responseURL = this._url;
      if (this.onreadystatechange) { try { this.onreadystatechange(); } catch(e) {} }
    },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
  };

  // Build sandbox with Z8XHJJY as catch-all for ALL objects
  const sandbox = {
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, RangeError,
    parseInt, parseFloat, isNaN, isFinite, NaN, Infinity, undefined,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
    setTimeout: function(fn) { try { if (typeof fn === 'function') fn(); } catch(e) {} return 1; },
    setInterval: function() { return 2; }, clearInterval: function() {}, clearTimeout: function() {},
    console: { log: function() {}, error: function() {}, warn: function() {}, debug: function() {}, info: function() {}, trace: function() {} },
    XMLHttpRequest: XHR,
    ActiveXObject: function() { return new XHR(); },
    fetch: function() { return Promise.resolve({ status: 200, text: function() { return Promise.resolve('{}'); } }); },
    URL: URL, URLSearchParams: URLSearchParams,
    Intl: Intl, TextEncoder: TextEncoder, TextDecoder: TextDecoder,
    Map: Map, Set: Set, WeakMap: WeakMap, WeakSet: WeakSet, Promise: Promise, Proxy: Proxy, Symbol: Symbol, Reflect: Reflect,
    ArrayBuffer: ArrayBuffer, Uint8Array: Uint8Array, Int32Array: Int32Array, Float64Array: Float64Array, DataView: DataView,
    btoa: function(s) { return Buffer.from(s, 'binary').toString('base64'); },
    atob: function(s) { return Buffer.from(s, 'base64').toString('binary'); },
    Z8XHJJY: Z8XHJJY,
    $_ts: { nsd: nsd, cd: cd },
  };

  // Wrap document/navigator/screen/location with deepProxy-based catch-all
  function makeDoc() {
    const doc = {
      _cookie: oCookie,
      get cookie() { return this._cookie; },
      set cookie(v) { cookieCapture.push(String(v)); this._cookie = this._cookie ? this._cookie + '; ' + v : String(v); },
      createElement: function(tag) {
        return makeElement(tag);
      },
      getElementsByTagName: function() { return []; },
      documentElement: makeElement('html'),
      body: makeElement('body'),
      head: makeElement('head'),
      hidden: false, visibilityState: 'visible',
      addEventListener: function() {}, removeEventListener: function() {},
      getElementById: function() { return null; },
      querySelector: function() { return null; },
      querySelectorAll: function() { return []; },
      readyState: 'complete', title: '', referrer: '',
      URL: 'https://pmos.xj.sgcc.com.cn:20080/',
      domain: 'pmos.xj.sgcc.com.cn',
    };
    return new Proxy(doc, {
      get(t, p) {
        if (p === Symbol.toPrimitive) return function() { return ''; };
        if (p === Symbol.iterator) return function*() {};
        if (p in t) return t[p];
        return deepProxy('doc.' + String(p));
      },
      has() { return true; },
    });
  }

  function makeElement(tag) {
    const el = {
      tagName: (tag || 'div').toUpperCase(),
      style: new Proxy({}, { get(t, p) { return t[p] !== undefined ? t[p] : ''; }, set(t, p, v) { t[p] = v; return true; } }),
      setAttribute: function() {}, getAttribute: function() { return null; },
      appendChild: function(child) { return child; },
      removeChild: function(child) { return child; },
      getElementsByTagName: function() { return []; },
      addEventListener: function() {}, removeEventListener: function() {},
      innerHTML: '', innerText: '', textContent: '',
      offsetWidth: 100, offsetHeight: 100, offsetLeft: 0, offsetTop: 0,
      clientWidth: 100, clientHeight: 100,
      getBoundingClientRect: function() { return { top: 0, left: 0, bottom: 100, right: 100, width: 100, height: 100 }; },
    };
    return new Proxy(el, {
      get(t, p) {
        if (p === Symbol.toPrimitive) return function() { return ''; };
        if (p in t) return t[p];
        return deepProxy('el.' + String(p));
      },
      has() { return true; },
    });
  }

  sandbox.document = makeDoc();
  sandbox.navigator = new Proxy({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'MacIntel', maxTouchPoints: 0, appName: 'Netscape', appVersion: '5.0',
    language: 'zh-CN', languages: ['zh-CN', 'zh'], cookieEnabled: true, hardwareConcurrency: 8,
    vendor: 'Google Inc.', product: 'Gecko', productSub: '20030107', appCodeName: 'Mozilla',
    onLine: true, webdriver: false,
    plugins: { length: 0, item: function() { return null; }, namedItem: function() { return null; } },
    mimeTypes: { length: 0 },
    connection: { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false },
  }, {
    get(t, p) { if (p in t) return t[p]; return deepProxy('nav.' + String(p)); },
    has() { return true; },
  });
  sandbox.screen = new Proxy({
    width: 1680, height: 1050, availWidth: 1680, availHeight: 1025, colorDepth: 24, pixelDepth: 24,
  }, {
    get(t, p) { if (p in t) return t[p]; return deepProxy('scr.' + String(p)); },
    has() { return true; },
  });
  sandbox.location = new Proxy({
    href: 'https://pmos.xj.sgcc.com.cn:20080/', pathname: '/', hostname: 'pmos.xj.sgcc.com.cn',
    host: 'pmos.xj.sgcc.com.cn:20080', port: '20080', protocol: 'https:',
    origin: 'https://pmos.xj.sgcc.com.cn:20080', search: '', hash: '',
    reload: function() {}, replace: function() {}, assign: function() {},
    toString: function() { return 'https://pmos.xj.sgcc.com.cn:20080/'; },
  }, {
    get(t, p) { if (p in t) return t[p]; return deepProxy('loc.' + String(p)); },
    has() { return true; },
  });
  sandbox.history = { length: 1, pushState: function() {}, replaceState: function() {}, back: function() {}, forward: function() {}, go: function() {} };
  sandbox.performance = { timing: { navigationStart: Date.now(), loadEventEnd: Date.now() + 1000, fetchStart: Date.now(), domainLookupStart: Date.now(), connectStart: Date.now(), connectEnd: Date.now(), requestStart: Date.now(), responseStart: Date.now(), responseEnd: Date.now(), domLoading: Date.now(), domComplete: Date.now(), loadEventStart: Date.now() }, now: function() { return Date.now() % 1000000; }, getEntriesByType: function() { return []; }, getEntries: function() { return []; }, navigation: { type: 0, redirectCount: 0 } };
  sandbox.localStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {}, clear: function() {}, length: 0, key: function() { return null; } };
  sandbox.sessionStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {}, clear: function() {}, length: 0, key: function() { return null; } };
  sandbox.crypto = { getRandomValues: function(a) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; }, subtle: deepProxy('crypto.subtle') };
  sandbox.chrome = { runtime: deepProxy('chrome.runtime'), app: { isInstalled: false }, csi: function() { return {}; }, loadTimes: function() { return {}; } };
  sandbox.Blob = function(arr, opts) { this.size = arr ? arr.length : 0; this.type = opts && opts.type || ''; };
  sandbox.FormData = function() { this.append = function() {}; };
  sandbox.Event = function() {}; sandbox.CustomEvent = function() {};
  sandbox.Headers = function() { this.append = function() {}; this.get = function() { return null; }; };
  sandbox.Request = function() {};
  sandbox.Response = function() {};

  // Anti-detection globals
  sandbox.callPhantom = undefined;
  sandbox._phantom = undefined;
  sandbox.__webdriver_script_fn = undefined;
  sandbox.__webdriver_script_func = undefined;
  sandbox.__webdriver_evaluate = undefined;
  sandbox.__selenium_evaluate = undefined;
  sandbox.__fxdriver_evaluate = undefined;
  sandbox.__driver_evaluate = undefined;
  sandbox.__driver_unwrapped = undefined;
  sandbox.__webdriver_alert = undefined;
  sandbox.__webdriver_alert_handle = undefined;
  sandbox.spawn = undefined;
  sandbox.emit = undefined;
  sandbox.Buffer = undefined; // hide Node.js Buffer from RS

  // Window self-references
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;
  sandbox.frames = sandbox;
  sandbox.opener = null;
  sandbox.closed = false;
  sandbox.name = '$_YWTU=LjFNq_oZCsth6KJ9xHOin6RRhL4fQt7Vsn8YCz9dRjl&$_YVTX=Wa&vdFm=_$hh';
  sandbox.status = '';
  sandbox.defaultStatus = '';
  sandbox.length = 0;
  sandbox.innerWidth = 1680; sandbox.innerHeight = 938;
  sandbox.outerWidth = 1680; sandbox.outerHeight = 1025;
  sandbox.devicePixelRatio = 1;
  sandbox.scrollX = 0; sandbox.scrollY = 0;
  sandbox.pageXOffset = 0; sandbox.pageYOffset = 0;
  sandbox.screenX = 0; sandbox.screenY = 0;
  sandbox.alert = function() {}; sandbox.confirm = function() { return true; }; sandbox.prompt = function() { return ''; };
  sandbox.getComputedStyle = function() { return new Proxy({}, { get: function() { return ''; } }); };
  sandbox.matchMedia = function() { return { matches: false, addListener: function() {}, removeListener: function() {} }; };
  sandbox.requestAnimationFrame = function(fn) { try { fn(); } catch(e) {} return 1; };
  sandbox.cancelAnimationFrame = function() {};

  // eval hook - capture dynamic code
  let dynExecuted = false;
  sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !dynExecuted) {
      dynExecuted = true;
      try {
        vm.runInContext(code, sandbox, { timeout: 15000 });
        console.log('Dynamic code OK');
      } catch(e) {
        console.log('Dynamic code error:', e.message.substring(0, 150));
      }
    }
    return undefined;
  };

  vm.createContext(sandbox);

  // Run outer VM
  try {
    vm.runInContext(outerJs, sandbox, { timeout: 15000 });
    console.log('Outer VM OK');
  } catch(e) {
    console.log('Outer VM error:', e.message.substring(0, 150));
  }

  // Wait for async operations
  await new Promise(r => setTimeout(r, 3000));

  console.log('\nCookies captured:', cookieCapture.length);
  cookieCapture.forEach(c => console.log('  ' + c.substring(0, 80)));

  // Check if XHR prototype was hooked by RS
  const openStr = XHR.prototype.open.toString();
  const sendStr = XHR.prototype.send.toString();
  console.log('\nXHR.open hooked:', !openStr.includes('_method'));
  console.log('XHR.open source:', openStr.substring(0, 100));
  console.log('XHR.send hooked:', !sendStr.includes('queryCapture'));

  // Make XHR POST to trigger query generation
  console.log('\nMaking XHR POST...');
  try {
    var xhr = new sandbox.XMLHttpRequest();
    xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    console.log('After open, URL:', xhr._url);
    xhr.send('{}');
    console.log('After send, URL:', xhr._url);
    console.log('Query captured:', queryCapture.value ? queryCapture.value.substring(0, 50) + '...' : 'null');
    if (queryCapture.method) console.log('Method:', queryCapture.method);
  } catch(e) {
    console.log('XHR error:', e.message);
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
