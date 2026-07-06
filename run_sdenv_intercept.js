// Intercept the outer js loading via a custom ResourceLoader, patch it ([]->new Array() + Proxy),
// and run it in the complete jsdomFromUrl environment to catch the [0] block creation.
const path = require('path');
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
require('module-alias')(path.dirname(require('./utils/paths').package));
const { jsdomFromUrl, jsdom, logger } = require('sdenv');
const gv = require('@src/handler/globalVarible');
const { getCode } = require('@utils/');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// __pa() creates a proxied empty array; only =[] sites use it (NOT all arrays)
const PROXY_DEF = `
var __paCnt = 0;
var __pa = function() {
  var id = ++__paCnt;
  var a = new Array();
  var p = new Proxy(a, {
    set(t, prop, v) {
      t[prop] = v;
      if (typeof prop === 'number' && (t.length === 61 || t.length === 204) && typeof t[0] === 'number') {
        console.log('[' + t.length + 'B NUM @pa' + id + ' set] first8=' + JSON.stringify(t.slice(0,8)) + ' stk=' + new Error().stack.split('\\n').slice(2,8).map(function(s){return s.trim()}).join(' | '));
      }
      return true;
    },
    defineProperty(t, prop, desc) {
      Object.defineProperty(t, prop, desc);
      if (typeof prop === 'number' && (t.length === 61 || t.length === 204) && typeof t[0] === 'number') {
        console.log('[' + t.length + 'B NUM @pa' + id + ' defProp] first8=' + JSON.stringify(t.slice(0,8)) + ' stk=' + new Error().stack.split('\\n').slice(2,8).map(function(s){return s.trim()}).join(' | '));
      }
      return true;
    }
  });
  return p;
};
// also hook Array.from, slice, concat to catch 61/204-element results
var __origFrom = Array.from;
Array.from = function() { var r = __origFrom.apply(Array, arguments); if ((r.length===61||r.length===204) && typeof r[0]==='number') console.log('[from '+r.length+'] first8='+JSON.stringify(r.slice(0,8))+' stk='+new Error().stack.split('\\n').slice(2,6).map(function(s){return s.trim()}).join(' | ')); return r; };
var __origSlice = Array.prototype.slice;
Array.prototype.slice = function() { var r = __origSlice.apply(this, arguments); if ((r.length===61||r.length===204) && typeof r[0]==='number') console.log('[slice '+r.length+'] first8='+JSON.stringify(r.slice(0,8))+' stk='+new Error().stack.split('\\n').slice(2,6).map(function(s){return s.trim()}).join(' | ')); return r; };
var __origConcat = Array.prototype.concat;
Array.prototype.concat = function() { var r = __origConcat.apply(this, arguments); if ((r.length===61||r.length===204) && typeof r[0]==='number') console.log('[concat '+r.length+'] first8='+JSON.stringify(r.slice(0,8))+' stk='+new Error().stack.split('\\n').slice(2,6).map(function(s){return s.trim()}).join(' | ')); return r; };
`;

// Replace ALL [] (empty array) with __pa() ONLY outside strings
function replaceOutsideStrings(code) {
  let result = '';
  let i = 0;
  let inStr = false, strCh = null, esc = false;
  let repCount = 0;
  while (i < code.length) {
    const c = code[i];
    if (esc) { result += c; esc = false; i++; continue; }
    if (c === '\\') { result += c; esc = true; i++; continue; }
    if (inStr) {
      if (c === strCh) { inStr = false; strCh = null; }
      result += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; result += c; i++; continue; }
    // check [] (empty array) outside strings
    if (c === '[' && code[i+1] === ']') {
      result += '__pa()'; i += 2; repCount++; continue;
    }
    result += c; i++;
  }
  return { code: result, repCount };
}

// Custom ResourceLoader that patches the outer js
const _loader = new jsdom.ResourceLoader({ strictSSL: false, userAgent: UA });
const _origFetch = _loader.fetch.bind(_loader);
_loader.fetch = function(url, options) {
  const req = _origFetch(url, options);  // original request object (thenable with .response, .href, .getHeader)
  // Wrap it: patch the body when .then() fires, but preserve .response/.href/.getHeader
  const wrapper = {
    get response() { return req.response; },
    get href() { return req.href; },
    getHeader: (name) => req.getHeader(name),
    then(onFulfilled, onRejected) {
      return req.then(body => {
        // patch the RS js body
        if (Buffer.isBuffer(body) && body.length > 10000) {
          let code = body.toString('utf8');
          if (code.indexOf('r2mKa') >= 0) {
            let patched = replaceOutsideStrings(code);
            code = PROXY_DEF + patched.code;
            console.log('[PATCHED] len=' + code.length + ' replacements=' + patched.repCount);
            body = Buffer.from(code, 'utf8');
          }
        }
        return onFulfilled ? onFulfilled(body) : body;
      }, onRejected);
    }
  };
  return wrapper;
};

(async () => {
  logger.level = 'warn';
  // pre-init gv.config for decrypt step
  const codeRet = await getCode(['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js']);
  gv._setAttr('argv', { mate: { jscode: codeRet.jscode, metaContent: [], url: undefined } });
  require('@src/config/')(gv);

  console.log('Loading pmos via sdenv (jsdomFromUrl + patched ResourceLoader)...');
  const dom = await jsdomFromUrl(TARGET, {
    userAgent: UA,
    resources: _loader,
    consoleConfig: { error: new Function, warn: new Function, log: new Function },
  });
  const { window, cookieJar } = dom;
  const sessNsd = window.$_ts && window.$_ts.nsd;
  const sessCd = window.$_ts && window.$_ts.cd;
  console.log('$_ts.nsd:', sessNsd, 'cd_len:', sessCd && sessCd.length);
  const sessTs = { nsd: sessNsd, cd: sessCd, from: TARGET, hasDebug: false };
  fs.writeFileSync('/tmp/pmos_session_ts.json', JSON.stringify(sessTs));

  let done = false;
  async function handle(cookies) {
    if (done) return; done = true;
    console.log('GENERATED COOKIE:', cookies.substring(0, 100));
    fs.writeFileSync('/tmp/pmos_session_cookie.txt', cookies);
    window.close();
    process.exit(0);
  }
  window.addEventListener('sdenv:exit', (e) => {
    if (['location.replace', 'location.assign'].includes(e.detail && e.detail.eventId)) {
      handle(cookieJar.getCookieStringSync(TARGET));
    }
  });
  window.addEventListener('sdenv:location.replace', () => handle(cookieJar.getCookieStringSync(TARGET)));
  setTimeout(() => { console.log('TIMEOUT'); window.close(); process.exit(1); }, 120000);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
