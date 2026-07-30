// Debug: find why trampoline returns empty string
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

  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const outerJsCode = fs.readFileSync(path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js'), 'utf8');

  function RSXHR() {}
  RSXHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    open: function(method, url) { this._method = method; this._url = String(url); this._headers = {}; this.readyState = 1; },
    send: function(body) { var self = this; Promise.resolve().then(function() { self.readyState = 4; self.status = 200; self.responseText = '{}'; if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} } }); },
    setRequestHeader: function(k, v) { if (!this._headers) this._headers = {}; this._headers[k] = v; },
    abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    upload: { addEventListener: function() {}, removeEventListener: function() {} },
  };

  const env = buildEnv({ nsd, cd }, { outerJsCode, seedCookie: oCookie, timeout: 30000 });
  env.sandbox.XMLHttpRequest = RSXHR;

  var origEval = env.sandbox.eval;
  var dynCode = null;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      dynCode = code;
      code = code.replace(/if\((\S+?)===1\)return\s+/g, 'if(true)return ');
    }
    return origEval.call(this, code);
  };

  try { vm.runInContext(outerJsCode, env.proxied, { timeout: 30000, filename: 'outer.js' }); }
  catch(e) { console.log('Outer VM error:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 2000));

  var rsOpen = RSXHR.prototype.open;
  var rsSend = RSXHR.prototype.send;

  var testXhr = new RSXHR();
  rsOpen.call(testXhr, 'POST', '/test', true);
  var ownProps = Object.getOwnPropertyNames(testXhr);
  var flagName = null, trampName = null;
  for (var k of ownProps) {
    if (k.startsWith('_') && typeof testXhr[k] === 'boolean') flagName = k;
    if (k.startsWith('_') && typeof testXhr[k] === 'function') trampName = k;
  }
  console.log('Flag:', flagName, 'Trampoline:', trampName);

  // Analyze dyn code for catch blocks and empty returns
  if (dynCode) {
    var tryCount = (dynCode.match(/try\s*{/g) || []).length;
    var catchCount = (dynCode.match(/catch\s*\(/g) || []).length;
    console.log('try blocks:', tryCount, 'catch blocks:', catchCount);

    // Find catch blocks that set empty string or return empty
    var catchBlocks = dynCode.match(/catch\([^)]*\)\s*\{[^}]{0,200}\}/g);
    if (catchBlocks) {
      var emptyOnes = catchBlocks.filter(function(e) {
        return e.includes("''") || e.includes('""') || e.includes('return;');
      });
      console.log('\nCatch blocks with empty string/return:', emptyOnes.length);
      emptyOnes.slice(0, 10).forEach(function(e, i) { console.log('  [' + i + ']', e.substring(0, 150)); });
    }

    // Look for patterns where a variable is set to empty string as default/fallback
    var emptyDefaults = dynCode.match(/=\s*''\s*;/g);
    console.log('\nEmpty string assignments:', emptyDefaults ? emptyDefaults.length : 0);

    // Look for the specific pattern: the trampoline VM returns empty string
    // This happens when the VM encounters a condition that prevents query generation
    // The condition is likely: checking if cookie is valid/verified
    
    // Search for 'r20SZOQm' or query param name in dyn code
    var queryParamMatches = dynCode.match(/r20SZOQm/g);
    console.log('\n"r20SZOQm" in dyn code:', queryParamMatches ? queryParamMatches.length : 0);
    
    // Search for query-related patterns
    var urlAppendPatterns = dynCode.match(/\.indexOf\([^)]*\)\s*>=\s*0/g);
    console.log('indexOf >= 0 patterns:', urlAppendPatterns ? urlAppendPatterns.length : 0);
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
