// 用全新沙箱跑第二遍（模拟真实页面 reload）
// 第一遍沙箱生成 cookie，提取 cookie
// 第二遍全新沙箱（带 cookie）执行外层 VM，RS 应启用 query
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

  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const outerJsCode = fs.readFileSync(path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js'), 'utf8');

  // Query capture XHR (原型模式)
  const queryCapture = { value: null };
  function RSXHR() {}
  RSXHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
    timeout: 0, withCredentials: false,
    open: function(method, url) { this._method = method; this._url = String(url); this._headers = {}; this.readyState = 1; },
    send: function(body) {
      var self = this;
      if (self._url && self._url.includes('r20SZOQm=')) {
        var match = self._url.match(/r20SZOQm=([^&]+)/);
        if (match) { queryCapture.value = match[1]; queryCapture.url = self._url; }
      }
      Promise.resolve().then(function() {
        if (self._url && self._url.includes('r20SZOQm=')) {
          var match2 = self._url.match(/r20SZOQm=([^&]+)/);
          if (match2) { queryCapture.value = match2[1]; queryCapture.url = self._url; }
        }
        self.readyState = 2;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        self.readyState = 4; self.status = 200;
        self.responseText = '{"status":0,"message":"Success","data":{}}';
        self.responseURL = self._url;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        if (self.onload) { try { self.onload(); } catch(e) {} }
      });
    },
    setRequestHeader: function(k, v) { if (!this._headers) this._headers = {}; this._headers[k] = v; },
    abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function(type, fn) { if (type === 'load') this.onload = fn; },
    removeEventListener: function() {},
    upload: { addEventListener: function() {}, removeEventListener: function() {} },
  };

  // ========== 第一遍：全新沙箱，生成 cookie ==========
  console.log('=== Pass 1: Generate cookie ===');
  const env1 = buildEnv({ nsd, cd }, { outerJsCode, seedCookie: oCookie, timeout: 30000 });
  env1.sandbox.XMLHttpRequest = RSXHR;
  try { vm.runInContext(outerJsCode, env1.proxied, { timeout: 30000, filename: 'outer1.js' }); } catch(e) { console.log('Pass1 err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 2000));

  // 提取生成的 cookie
  const allCookies = env1.captured.cookies.map(c => c.split(';')[0]).join('; ');
  console.log('Pass 1 cookies:', env1.captured.cookies.length);
  console.log('Full cookie string:', allCookies.substring(0, 100) + '...');
  
  const pCookieRaw = env1.captured.cookies.find(c => c.includes('P='));
  const pCookie = pCookieRaw ? pCookieRaw.split(';')[0] : null;
  console.log('P cookie:', pCookie ? pCookie.substring(0, 40) + '...' : 'null');

  if (!pCookie) { console.log('No P cookie generated'); process.exit(1); }

  // ========== 第二遍：全新沙箱，带 cookie，模拟 reload ==========
  console.log('\n=== Pass 2: Fresh sandbox with cookie (simulate reload) ===');
  const seedCookie = oCookie + '; ' + pCookie;
  const env2 = buildEnv({ nsd, cd }, { outerJsCode, seedCookie, timeout: 30000 });
  env2.sandbox.XMLHttpRequest = RSXHR;
  
  // 验证 cookie 存在
  const cookieCheck = vm.runInContext('document.cookie', env2.proxied);
  console.log('Cookie in pass 2:', cookieCheck.substring(0, 80) + '...');
  console.log('Has P cookie:', cookieCheck.includes('P='));

  try { vm.runInContext(outerJsCode, env2.proxied, { timeout: 30000, filename: 'outer2.js' }); console.log('Pass 2 OK'); }
  catch(e) { console.log('Pass 2 err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 3000));

  // 检查 RS hook
  const openStr = RSXHR.prototype.open.toString();
  console.log('\nXHR.open hooked:', !openStr.includes('_method'));

  // 尝试 XHR POST
  console.log('\n--- XHR POST in pass 2 context ---');
  try {
    // 在 vm context 内部创建 XHR
    var inContextResult = vm.runInContext([
      'try {',
      '  var xhr = new XMLHttpRequest();',
      '  xhr.open("POST", "/px-gateway/GatewayConfig/getGatewayConfig", true);',
      '  var flag = null;',
      '  for (var k in xhr) { if (k.charAt(0) === "_" && typeof xhr[k] === "boolean") flag = k + "=" + xhr[k]; }',
      '  xhr.send("{}");',
      '  JSON.stringify({',
      '    url: xhr._url,',
      '    hasQuery: xhr._url.indexOf("r20SZOQm") >= 0,',
      '    flag: flag,',
      '    readyState: xhr.readyState,',
      '  });',
      '} catch(e) {',
      '  JSON.stringify({ error: e.message.substring(0, 80) });',
      '}',
    ].join('\n'), env2.proxied, { timeout: 5000 });
    console.log('In-context result:', inContextResult);
    
    var parsed = JSON.parse(inContextResult);
    if (parsed.hasQuery) {
      var match = parsed.url.match(/r20SZOQm=([^&]+)/);
      if (match) {
        queryCapture.value = match[1];
        console.log('QUERY CAPTURED:', match[1].substring(0, 50));
      }
    }
  } catch(e) { console.log('In-context error:', e.message); }

  // 也从外部尝试
  console.log('\n--- External XHR POST ---');
  try {
    var xhr = new RSXHR();
    xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    console.log('After open: _url=' + xhr._url);
    // 检查 flag
    for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') console.log('  flag:', k, '=', xhr[k]); }
    xhr.send('{}');
    console.log('After send: _url=' + xhr._url);
  } catch(e) { console.log('External error:', e.message); }

  await new Promise(r => setTimeout(r, 1000));
  console.log('\nFinal query:', queryCapture.value ? queryCapture.value.substring(0, 50) + '...' : 'null');

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
