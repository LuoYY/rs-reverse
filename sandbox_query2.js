// 复用 sandbox_keygen.js 的 buildEnv（已验证可跑通 RS 动态代码）
// 在此基础上 hook XHR 来捕获 query 参数生成
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const https = require('https');

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

  // 复用已验证的 buildEnv
  const { buildEnv, runSandbox } = require('./output/keygen/sandbox_keygen.js');
  
  // 先用原始 buildEnv 跑一次，确认动态代码能执行
  const outerJsCode = fs.readFileSync(path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js'), 'utf8');
  
  const result = runSandbox({ nsd, cd }, { outerJsCode, seedCookie: oCookie, timeout: 30000 });
  console.log('pCookie:', result.pCookie ? result.pCookie.substring(0, 40) + '...' : 'null');
  console.log('dynCodeLen:', result.dynCodeLen);
  console.log('errors:', result.errors.length);
  result.errors.slice(0, 3).forEach(e => console.log('  err:', e.substring(0, 80)));
  console.log('missing props:', result.missing.slice(0, 20));
  console.log('cookies:', result.cookies.length);
  result.cookies.forEach(c => console.log('  ' + c.substring(0, 60)));
  
  if (!result.pCookie) {
    console.log('\nNo cookie generated, cant proceed with query');
    process.exit(1);
  }
  
  // 动态代码已成功执行并生成了 cookie！
  // 现在 RS 动态代码已经 hook 了 XHR.prototype.open/send
  // 但我们的 XHR 是空壳（open=()=>{}），RS hook 可能没生效
  // 
  // 策略：修改 buildEnv，提供真实的 XHR polyfill，让 RS hook 它
  // 然后触发 XHR POST，捕获 query 生成
  
  // 实际上，buildEnv 里的 XHR 是：
  // XMLHttpRequest: function () { this.open = () => {}; this.send = () => {}; ... }
  // RS hook 的是 XMLHttpRequest.prototype.open/send
  // 但这里 open/send 是实例属性，不是原型属性
  // RS 无法 hook 实例属性！
  //
  // 修复：改为原型模式
  
  console.log('\n--- Now with XHR prototype polyfill ---');
  
  // 自定义 buildEnv，替换 XHR 为原型模式
  const vm = require('vm');
  
  // Query capture XHR
  const queryCapture = { value: null };
  
  function XHRProto() {}
  XHRProto.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
    timeout: 0, withCredentials: false,
    open: function(method, url) { this._method = method; this._url = String(url); this.readyState = 1; },
    send: function(body) {
      var self = this;
      // Check if RS modified the URL (appended query)
      if (self._url) {
        var match = self._url.match(/r20SZOQm=([^&]+)/);
        if (match) { queryCapture.value = match[1]; queryCapture.url = self._url; queryCapture.method = self._method; }
      }
      // Simulate async response (like real XHR)
      // RS hook may modify URL BEFORE calling original send
      // So check URL again after a microtask delay
      Promise.resolve().then(function() {
        if (self._url) {
          var match2 = self._url.match(/r20SZOQm=([^&]+)/);
          if (match2) { queryCapture.value = match2[1]; queryCapture.url = self._url; }
        }
        self.readyState = 2;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        self.readyState = 3;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        self.readyState = 4; self.status = 200; self.responseText = '{"status":0,"message":"Success","data":{}}';
        self.responseURL = self._url;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        if (self.onload) { try { self.onload(); } catch(e) {} }
      });
    },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function(type, fn) { if (type === 'load') this.onload = fn; if (type === 'readystatechange') this.onreadystatechange = fn; },
    removeEventListener: function() {},
    upload: { addEventListener: function() {}, removeEventListener: function() {} },
  };
  
  // Build custom env using the same pattern as buildEnv but with our XHR
  const env = buildEnv({ nsd, cd }, { outerJsCode, seedCookie: oCookie, timeout: 30000 });
  
  // Replace XHR in the proxied sandbox
  env.proxied.XMLHttpRequest = XHRProto;
  env.sandbox.XMLHttpRequest = XHRProto;
  
  // Re-run outer VM (need fresh context)
  const env2 = buildEnv({ nsd, cd }, { outerJsCode, seedCookie: oCookie, timeout: 30000 });
  // Override XHR before running
  env2.sandbox.XMLHttpRequest = XHRProto;
  
  // Re-create context with modified sandbox
  // Actually, buildEnv already created the context. We need to modify the proxied object.
  // The Proxy wraps sandbox, so setting sandbox.XMLHttpRequest should work.
  
  // Run outer VM again in the new env
  try {
    vm.runInContext(outerJsCode, env2.proxied, { timeout: 30000, filename: 'outer.js' });
  } catch(e) {
    console.log('Outer VM error:', e.message.substring(0, 80));
  }
  
  // Wait for async
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('Cookies:', env2.captured.cookies.length);
  env2.captured.cookies.forEach(c => console.log('  ' + c.substring(0, 60)));
  
  // RS has hooked XHR.prototype.open/send
  // Now wrap RS's hooks to see what they do
  const rsOpen = XHRProto.prototype.open;
  const rsSend = XHRProto.prototype.send;
  
  // Wrap RS open to log
  XHRProto.prototype.open = function(method, url) {
    console.log('[Wrap] open called:', method, String(url).substring(0, 60));
    var result = rsOpen.apply(this, arguments);
    console.log('[Wrap] after open, _url:', this._url);
    // Check if RS stored the URL somewhere else
    for (var k in this) {
      if (typeof this[k] === 'string' && this[k].length > 10 && k !== '_url' && k !== 'responseText' && k !== 'responseURL') {
        console.log('[Wrap] string prop:', k, '=', this[k].substring(0, 60));
      }
    }
    return result;
  };
  
  // Wrap RS send to log - check what RS does internally
  XHRProto.prototype.send = function(body) {
    console.log('[Wrap] send called, _url:', this._url);
    console.log('[Wrap] send body:', body);
    console.log('[Wrap] props before rsSend:');
    for (var k in this) {
      if (k.startsWith('_$') || k.startsWith('_$$')) {
        console.log('  ' + k + ':', typeof this[k], String(this[k]).substring(0, 40));
      }
    }
    
    // Call RS send
    var result = rsSend.apply(this, arguments);
    
    console.log('[Wrap] after rsSend, readyState:', this.readyState);
    console.log('[Wrap] after rsSend, props:');
    for (var k in this) {
      if (k.startsWith('_$') || k.startsWith('_$$')) {
        console.log('  ' + k + ':', typeof this[k], String(this[k]).substring(0, 40));
      }
    }
    // Check for query in any string prop
    for (var k in this) {
      if (typeof this[k] === 'string' && this[k].length > 5) {
        console.log('  str ' + k + ':', this[k].substring(0, 60));
      }
    }
    return result;
  };
  
  // RS hooks prototype.open AND prototype.send
  // The flow is: RS.open(method, url) -> stores url -> RS.send(body) -> modifies url -> calls original send
  // Our original open/send are saved by RS and called back
  // But our original send checks this._url which was set by our original open
  // RS's hook on send might modify the URL differently
  
  // Make XHR POST - use the HOOKED prototype
  console.log('\nMaking XHR POST...');
  try {
    var xhr = new env2.proxied.XMLHttpRequest();
    // RS's hooked open will be called
    xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    // After RS's open hook, check if _url was set (our original open sets _url)
    console.log('After open, _url:', xhr._url);
    console.log('After open, readyState:', xhr.readyState);
    
    // RS's hooked send will be called - it should modify URL and call original send
    // Our original send checks _url for query param
    // But RS might set the URL on a different property or modify it before calling original send
    xhr.send('{}');
    console.log('After send, _url:', xhr._url);
    console.log('After send, responseURL:', xhr.responseURL);
    console.log('After send, status:', xhr.status);
    
    // Check query
    console.log('Query:', queryCapture.value ? queryCapture.value.substring(0, 50) + '...' : 'null');
    
    // Also check: did RS set any other properties on xhr?
    var xhrProps = [];
    for (var k in xhr) { xhrProps.push(k + '=' + String(xhr[k]).substring(0, 30)); }
    console.log('XHR props:', xhrProps.join(', '));
  } catch(e) {
    console.log('XHR error:', e.message);
    console.log('XHR error stack:', e.stack?.split('\n').slice(0,3).join('\n'));
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
