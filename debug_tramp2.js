// Debug: find the query param name and how URL is modified
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

  // Capture ALL string operations during trampoline execution
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

  // The query param name 'r20SZOQm' is NOT in the dyn code.
  // It's in the outer JS code or derived from keys[7].
  // Let me check the outer JS code
  var outerQueryMatch = outerJsCode.match(/r20SZOQm/g);
  console.log('\n"r20SZOQm" in outer JS:', outerQueryMatch ? outerQueryMatch.length : 0);

  // Check keys[7] in the sandbox
  var keysResult = vm.runInContext('typeof $_ts !== "undefined" ? JSON.stringify(Object.keys($_ts)) : "no $_ts"', env.proxied);
  console.log('$_ts keys:', keysResult);

  // Check if $_ts has keys or aebi
  var tsProps = vm.runInContext('JSON.stringify(Object.getOwnPropertyNames($_ts))', env.proxied);
  console.log('$_ts props:', tsProps);

  // The query param name comes from keys[7].split(';')[1]
  // keys are derived from cd decryption
  // Let me check what keys are available after RS execution
  var tsData = vm.runInContext([
    'try {',
    '  var result = {};',
    '  result.scj = typeof $_ts.scj;',
    '  result.aebi = typeof $_ts.aebi;',
    '  result.nsd = $_ts.nsd;',
    '  result.cd_length = $_ts.cd ? $_ts.cd.length : 0;',
    '  JSON.stringify(result);',
    '} catch(e) {',
    '  JSON.stringify({error: e.message.substring(0, 80)});',
    '}',
  ].join('\n'), env.proxied);
  console.log('\n$_ts data:', tsData);

  // The trampoline returns empty string.
  // This means the VM's query generation code runs but produces empty output.
  // The query param name is derived at runtime from keys.
  // Let me check if the VM has access to the query param name.
  
  // Check the RS hooked send - it modifies the URL
  // The URL modification happens AFTER the trampoline returns
  // RS.send: if(flag) { query = tramp(body); if(query) url += '?' + paramName + '=' + query; }
  
  // The trampoline returns empty string, so query is falsy, so URL is not modified.
  // We need to find why the trampoline returns empty string.
  
  // The trampoline VM bytecode generates the query value.
  // The generation depends on session state (cookie, timestamp, etc.)
  // In the sandbox, some state is missing.
  
  // Let me check: what does the trampoline VM actually compute?
  // The VM has access to:
  // - this (XHR instance)
  // - arguments (body string)  
  // - VM context (bytecode + constants + closures)
  // The VM closure has access to all the RS internal state.
  
  // The empty string might be because:
  // 1. A try/catch catches an error and sets empty string
  // 2. A condition evaluates to false and skips generation
  // 3. A required value (like a key) is missing
  
  // From the catch analysis:
  // catch(_$l3){_$fJ[_$cv]='';}  -- sets some property to empty string on error
  // catch(_$k$){_$l3="";}        -- sets return value to empty string on error
  
  // The second one is very suspicious! It directly sets the return to empty string.
  // Let me find this pattern in the dyn code and see what error triggers it.

  if (dynCode) {
    // Find the context around catch(_$k$){_$l3="";}
    var patterns = [
      /catch\([^)]*\)\s*\{[^}]*=""\s*;\s*\}/g,
      /catch\([^)]*\)\s*\{[^}]*=''\s*;\s*\}/g,
    ];
    
    for (var p of patterns) {
      var matches = dynCode.match(p);
      if (matches) {
        console.log('\nPattern:', p.source, 'matches:', matches.length);
        matches.forEach(function(m, i) {
          // Find position in code
          var pos = dynCode.indexOf(m);
          var context = dynCode.substring(Math.max(0, pos - 200), pos + m.length + 50);
          console.log('  [' + i + '] at pos', pos, ':');
          console.log('  context:', context.substring(0, 300));
          console.log();
        });
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
