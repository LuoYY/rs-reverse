// XHR polyfill that makes REAL network requests
// RS hook needs the XHR to actually send to trigger async behavior
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

function httpXHR(method, url, headers, body) {
  return new Promise(r => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method,
      rejectUnauthorized: false,
      headers: { ...headers },
    };
    const req = https.request(opts, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    });
    req.on('error', e => r({ status: 0, body: '', error: e.message }));
    if (body) req.write(body);
    req.end();
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

  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const outerJsCode = fs.readFileSync(path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js'), 'utf8');

  const queryCapture = { value: null };

  // XHR that makes REAL network requests
  function XHRProto() {}
  XHRProto.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '', responseHeaders: '',
    UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
    timeout: 0, withCredentials: false,
    open: function(method, url) {
      this._method = method;
      this._url = String(url);
      this._headers = {};
      this.readyState = 1;
    },
    send: function(body) {
      var self = this;
      var fullUrl = self._url;
      if (fullUrl.startsWith('/')) fullUrl = 'https://pmos.xj.sgcc.com.cn:20080' + fullUrl;
      
      // Check if RS modified URL before send
      if (self._url && self._url.includes('r20SZOQm=')) {
        var match = self._url.match(/r20SZOQm=([^&]+)/);
        if (match) { queryCapture.value = match[1]; console.log('QUERY FOUND before send:', match[1].substring(0, 40)); }
      }
      
      // Make real network request
      self.readyState = 2;
      if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
      
      httpXHR(self._method, fullUrl, self._headers, body).then(function(resp) {
        self.readyState = 3;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        
        self.status = resp.status;
        self.responseText = resp.body;
        self.responseURL = self._url;
        self.readyState = 4;
        
        // Check if RS modified URL during async
        if (self._url && self._url.includes('r20SZOQm=')) {
          var match2 = self._url.match(/r20SZOQm=([^&]+)/);
          if (match2) { queryCapture.value = match2[1]; console.log('QUERY FOUND after response:', match2[1].substring(0, 40)); }
        }
        
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        if (self.onload) { try { self.onload(); } catch(e) {} }
      });
    },
    setRequestHeader: function(k, v) { this._headers[k] = v; },
    abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return this.responseHeaders; },
    getResponseHeader: function(k) { return null; },
    addEventListener: function(type, fn) {
      if (type === 'load') this.onload = fn;
      if (type === 'readystatechange') { var orig = this.onreadystatechange; this.onreadystatechange = function() { if (orig) orig(); fn(); }; }
    },
    removeEventListener: function() {},
    upload: { addEventListener: function() {}, removeEventListener: function() {} },
  };

  // Build env with our real XHR
  const env = buildEnv({ nsd, cd }, { outerJsCode, seedCookie: oCookie, timeout: 30000 });
  
  // Replace XHR before running
  env.sandbox.XMLHttpRequest = XHRProto;
  
  // Run outer VM
  try {
    vm.runInContext(outerJsCode, env.proxied, { timeout: 30000, filename: 'outer.js' });
  } catch(e) {
    console.log('Outer VM error:', e.message.substring(0, 80));
  }
  
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('Cookies:', env.captured.cookies.length);
  env.captured.cookies.forEach(c => console.log('  ' + c.substring(0, 60)));
  
  // Check XHR hook
  console.log('\nXHR.open hooked:', XHRProto.prototype.open.toString().includes('[native'));
  console.log('XHR.send hooked:', XHRProto.prototype.send.toString().includes('[native'));
  
  // Make real XHR POST with cookies
  console.log('\nMaking real XHR POST...');
  var pCookie = env.captured.cookies.find(c => c.includes('P='));
  var cookieStr = oCookie + '; ' + pCookie.split(';')[0];
  
  try {
    var xhr = new XHRProto();
    xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    xhr.setRequestHeader('Cookie', cookieStr);
    xhr.onreadystatechange = function() {
      console.log('readyState:', xhr.readyState, 'status:', xhr.status, 'url:', xhr._url?.substring(0, 60));
      if (xhr._url && xhr._url.includes('r20SZOQm=')) {
        var match = xhr._url.match(/r20SZOQm=([^&]+)/);
        if (match) { queryCapture.value = match[1]; console.log('QUERY CAPTURED:', match[1].substring(0, 40)); }
      }
    };
    xhr.send('{}');
    
    // Wait for async response
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('\nFinal _url:', xhr._url);
    console.log('Final responseURL:', xhr.responseURL);
    console.log('Final status:', xhr.status);
    console.log('Query:', queryCapture.value ? queryCapture.value.substring(0, 50) + '...' : 'null');
    if (xhr.responseText) console.log('Response:', xhr.responseText.substring(0, 80));
  } catch(e) {
    console.log('XHR error:', e.message);
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
