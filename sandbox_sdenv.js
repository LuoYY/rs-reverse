// Use sdenv + vm context: sdenv provides DOM objects, vm provides global scope
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

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

  const sdenv = require('sdenv');
  const outerJs = fs.readFileSync(path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js'), 'utf8');

  // Create jsdom for DOM objects
  const dom = sdenv.jsdomFromText('<!DOCTYPE html><html><head></head><body></body></html>', 'https://pmos.xj.sgcc.com.cn:20080/');
  const win = dom.window;

  // Build a vm sandbox that uses jsdom objects but has $_ts as global
  const queryCapture = { value: null };
  const cookieCapture = [];

  // Set cookie
  try { win.document.cookie = oCookie; } catch(e) {}

  // Hook document.cookie
  const doc = win.document;
  const origCookie = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(doc), 'cookie') ||
                     Object.getOwnPropertyDescriptor(doc.constructor.prototype, 'cookie');
  if (origCookie && origCookie.set) {
    const origSet = origCookie.set;
    Object.defineProperty(doc, 'cookie', {
      get() { return origCookie.get ? origCookie.get.call(doc) : oCookie; },
      set(v) { cookieCapture.push(String(v).substring(0, 80)); try { origSet.call(doc, v); } catch(e) {} },
      configurable: true,
    });
  }

  // Create sandbox with jsdom objects + $_ts
  const sandbox = {
    // Browser globals from jsdom
    document: doc,
    navigator: win.navigator,
    screen: win.screen,
    location: win.location,
    history: win.history,
    localStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {}, clear: function() {}, length: 0, key: function() { return null; } },
    sessionStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {}, clear: function() {}, length: 0, key: function() { return null; } },
    XMLHttpRequest: win.XMLHttpRequest,
    // Node.js builtins
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, RangeError,
    parseInt, parseFloat, isNaN, isFinite, NaN, Infinity, undefined,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
    setTimeout: function(fn) { try { if (typeof fn === 'function') fn(); } catch(e) {} return 1; },
    setInterval: function() { return 2; }, clearInterval: function() {}, clearTimeout: function() {},
    console: { log: function() {}, error: function() {}, warn: function() {}, debug: function() {}, info: function() {}, trace: function() {} },
    Intl: Intl, TextEncoder: TextEncoder, TextDecoder: TextDecoder,
    Map: Map, Set: Set, WeakMap: WeakMap, WeakSet: WeakSet, Promise: Promise, Proxy: Proxy, Symbol: Symbol, Reflect: Reflect,
    ArrayBuffer: ArrayBuffer, Uint8Array: Uint8Array, Int32Array: Int32Array, Float64Array: Float64Array, DataView: DataView,
    btoa: function(s) { return Buffer.from(s, 'binary').toString('base64'); },
    atob: function(s) { return Buffer.from(s, 'base64').toString('binary'); },
    URL: URL, URLSearchParams: URLSearchParams,
    // RS seed
    $_ts: { nsd: nsd, cd: cd },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;
  sandbox.frames = sandbox;
  sandbox.opener = null;
  sandbox.closed = false;
  sandbox.name = '$_YWTU=LjFNq_oZCsth6KJ9xHOin6RRhL4fQt7Vsn8YCz9dRjl&$_YVTX=Wa&vdFm=_$hh';
  sandbox.innerWidth = 1680; sandbox.innerHeight = 938;
  sandbox.outerWidth = 1680; sandbox.outerHeight = 1025;
  sandbox.devicePixelRatio = 1;
  sandbox.chrome = { runtime: {}, app: { isInstalled: false } };
  sandbox.callPhantom = undefined; sandbox._phantom = undefined;
  sandbox.__webdriver_script_fn = undefined;
  sandbox.Buffer = undefined;

  // eval hook - capture dynamic code but execute in SAME context
  // CRITICAL: must use the ORIGINAL eval so the dynamic code runs in the same scope
  // where $_ts.scj and $_ts.aebi are set by the outer VM
  const origEval = sandbox.eval || eval;
  let dynExecuted = false;
  sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !dynExecuted) {
      dynExecuted = true;
      console.log('Dynamic code captured:', code.length, 'bytes');
      // Execute in the SAME vm context (not a new one)
      try {
        vm.runInContext(code, sandbox, { timeout: 15000 });
        console.log('Dynamic code executed OK');
      } catch(e) {
        console.log('Dynamic code error:', e.message.substring(0, 150));
        // Check if $_ts has scj/aebi
        try {
          var hasScj = vm.runInContext('typeof $_ts.scj', sandbox);
          var hasAebi = vm.runInContext('typeof $_ts.aebi', sandbox);
          console.log('$_ts.scj:', hasScj, '$_ts.aebi:', hasAebi);
          console.log('$_ts keys:', vm.runInContext('Object.keys($_ts)', sandbox));
        } catch(e2) {}
      }
    } else if (typeof code === 'string') {
      // For smaller eval calls, use the original eval in context
      return vm.runInContext(code, sandbox);
    }
    return undefined;
  };

  vm.createContext(sandbox);

  // Run outer VM
  console.log('Running outer VM...');
  try {
    vm.runInContext(outerJs, sandbox, { timeout: 15000 });
    console.log('Outer VM OK');
  } catch(e) {
    console.log('Outer VM error:', e.message.substring(0, 150));
  }

  // Wait for async
  await new Promise(r => setTimeout(r, 3000));

  console.log('\nCookies:', cookieCapture.length);
  cookieCapture.forEach(c => console.log('  ' + c));

  // Check XHR hook
  const openStr = win.XMLHttpRequest.prototype.open.toString();
  console.log('\nXHR.open:', openStr.substring(0, 80));
  console.log('Is jsdom native:', openStr.includes('esValue'));

  // Make XHR POST
  console.log('\nMaking XHR POST...');
  try {
    var xhr = new sandbox.XMLHttpRequest();
    xhr.open('POST', 'https://pmos.xj.sgcc.com.cn:20080/px-gateway/GatewayConfig/getGatewayConfig', true);
    console.log('After open');
    xhr.onreadystatechange = function() {
      console.log('readyState:', xhr.readyState, 'status:', xhr.status);
      if (xhr.readyState === 4) {
        var match = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
        if (match) { queryCapture.value = match[1]; console.log('QUERY:', queryCapture.value.substring(0, 40)); }
      }
    };
    xhr.send('{}');
    console.log('After send');
  } catch(e) {
    console.log('XHR error:', e.message);
  }

  await new Promise(r => setTimeout(r, 1000));
  console.log('\nQuery:', queryCapture.value ? queryCapture.value.substring(0, 50) + '...' : 'null');

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
