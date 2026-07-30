// Debug: wrap VM dispatcher to log args[5] (return value) 
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

  // Patch: force exit + wrap the main VM dispatcher to log return values
  var origEval = env.sandbox.eval;
  var dynCode = null;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      dynCode = code;
      code = code.replace(/if\((\S+?)===1\)return\s+/g, 'if(true)return ');
      
      // The VM dispatchers are the functions containing while(1)
      // The main one is _$k7 (72265 chars) = L1 main VM (cookie/key/query logic)
      // We need to wrap it to log args[4] (exit code) and args[5] (return value)
      
      // But we can't wrap it because it's defined inside the IIFE closure.
      // Instead, let's modify the trampoline to log the return value.
      // We already forced exit, now let's also log what _$_u (return value var) is.
      
      // Actually, let me try a different approach entirely:
      // The trampoline calls: VM_DISP(CTX, 0, CTX.BC.length, ARGS)
      // After the call, ARGS[5] has the return value.
      // We want to know what the VM set ARGS[5] to.
      //
      // We can modify the dyn code to add a global variable that stores
      // the last VM return value, and log it.
      
      // But actually, the trampoline already reads ARGS[5] into a local var
      // and returns it. We forced the return. So the trampoline returns ARGS[5].
      // ARGS[5] is empty string. The VM sets it to empty string.
      //
      // The VM's query generation code produces empty string.
      // This is the normal output, not an error.
      // The query generation algorithm runs but produces empty string.
      //
      // WHY? The algorithm needs:
      // 1. A key (query encryption key, generated at runtime)
      // 2. Session data (48 bytes, same-session fixed)
      // 3. Request data (32 bytes, per-request)
      // 4. Nonce (4 bytes, random)
      //
      // If any of these fails, the result would be empty or wrong.
      // The most likely failure: the key generation fails.
      //
      // From the cookie analysis, we know the VM generates keys16/keys17.
      // The query key is different from cookie keys.
      // The query key might depend on some state that's not set.
      //
      // Let me check: what does the VM context object look like?
      // The trampoline accesses: CTX._$bj (bytecode), CTX._$$A (scope?),
      // CTX._$dv (closure vars?), CTX._$_i (cache flag)
      //
      // If CTX._$_i is true, the trampoline takes a cached path.
      // If false, it builds a new scope.
      //
      // Let me check if the cache flag affects the result.
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

  // The trampoline returns empty string.
  // The VM runs but produces empty string for the query.
  //
  // Key insight: The VM bytecode for query generation checks some condition
  // and if the condition is false, it returns empty string.
  // The condition is likely related to cookie validation state.
  //
  // In the browser flow:
  // 1. First page load: RS generates cookie, sets flag=false
  // 2. Page reloads with cookie
  // 3. Second page load: RS detects valid cookie (200 response)
  // 4. RS sets some internal state to "validated"
  // 5. XHR requests: RS generates query because state is "validated"
  //
  // In sandbox:
  // - We generate cookie (step 1)
  // - We never get validation (step 3)
  // - State is never set to "validated"
  // - Query generation returns empty string
  //
  // The "validated" state is likely stored in $_mb (shared state array)
  // or in a closure variable.
  //
  // From opcode-table.md, _$mb is the shared state array.
  // Various opcodes set _$mb[N] values.
  // The validation state might be one of these.
  //
  // Let me check which _$mb values are set during initialization
  // and which ones might control query generation.
  
  // Actually, let me try the simplest possible thing:
  // The RS code might check document.cookie for a specific pattern
  // or check if the page was loaded with 200 status.
  // Let me simulate a "validated" state by providing a cookie that
  // looks like it was accepted by the server.

  // Approach: Two-pass with real network validation
  // Pass 1: Generate cookie in sandbox
  // Pass 2: Use cookie to make real request, get 200 response
  // Pass 3: New sandbox with cookie + simulated 200 response → RS enables query

  console.log('\n=== Two-pass approach with real validation ===');
  
  // Pass 1: Already done - we have the cookie
  var pCookie = env.captured.cookies.find(c => c.includes('P='));
  if (!pCookie) { console.log('No P cookie'); process.exit(1); }
  var pCookieStr = pCookie.split(';')[0];
  console.log('P cookie:', pCookieStr.substring(0, 40) + '...');
  
  // Pass 2: Validate cookie with real request
  var fullCookie = oCookie + '; ' + pCookieStr;
  console.log('Validating cookie...');
  var validation = await httpGet('https://pmos.xj.sgcc.com.cn:20080/');
  // Actually we need to make the request WITH the cookie
  var validateResult = await new Promise(r => {
    https.get('https://pmos.xj.sgcc.com.cn:20080/', {
      rejectUnauthorized: false,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': fullCookie }
    }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', e => r({ status: 'ERR', body: '' }));
  });
  console.log('Validation status:', validateResult.status);
  console.log('Is 200:', validateResult.status === 200);
  
  // Pass 3: Fresh sandbox with validated cookie
  // The key: RS needs to see that the page returned 200 (not 412)
  // In the sandbox, RS checks the response status somehow.
  // Actually, RS generates cookie client-side, it doesn't check server response.
  // The "validation" happens when RS code runs on a page that already has the cookie.
  // On second load, RS sees cookie exists and sets internal state.
  //
  // But we already tried two-pass (sandbox_query3.js) and it didn't work.
  // The flag was still false.
  //
  // Let me look at this differently.
  // The trampoline returns empty string.
  // The trampoline is the query generator.
  // The generator runs but produces empty string.
  //
  // Maybe the generator needs to be "initialized" first.
  // In the browser, RS runs some initialization on page load that
  // sets up the query generator state.
  // This initialization might depend on the page being a 200 page.
  //
  // On a 412 page, RS generates cookie but doesn't initialize query gen.
  // On a 200 page, RS initializes query gen.
  //
  // In our sandbox, we're running the 412 page's RS code.
  // The 412 page RS code doesn't initialize query gen.
  // We need the 200 page's RS code.
  //
  // But the outer JS is the same for both 412 and 200 pages!
  // The difference is the challenge page HTML.
  // On 412: HTML has $_ts.nsd/cd set
  // On 200: HTML has different $_ts content (or same?)
  //
  // Let me check: what does the 200 page look like?

  if (validateResult.status === 200) {
    var ts200 = validateResult.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (ts200) {
      console.log('\n200 page has $_ts:', ts200[1], ts200[2].substring(0, 20) + '...');
    } else {
      console.log('\n200 page does NOT have $_ts.nsd/cd');
      // Check if it has any $_ts
      var tsAny = validateResult.body.match(/\$_ts\.\w+/g);
      console.log('$_ts references:', tsAny ? tsAny.slice(0, 10) : 'none');
      
      // Check if it has the outer JS
      var outerJs200 = validateResult.body.match(/src="([^"]*rGTR1U4jJCVr[^"]*)"/);
      console.log('Outer JS reference:', outerJs200 ? outerJs200[1] : 'not found');
      
      // Check page length and first 200 chars
      console.log('Page length:', validateResult.body.length);
      console.log('First 200 chars:', validateResult.body.substring(0, 200));
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
