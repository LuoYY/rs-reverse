// 在 sandbox_keygen.js 的 buildEnv 基础上，替换 XHR 为原型模式 + 捕获 query
// RS 动态代码 hook XMLHttpRequest.prototype.open/send 来追加 query 参数
// buildEnv 的 XHR 用实例属性（this.open=()=>{}），RS 无法 hook
// 修复：改为原型属性
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

  // 原型模式 XHR — RS 可以 hook prototype.open/send
  const queryCapture = { value: null, url: null, method: null };
  const xhrInstances = [];

  function RSXHR() {}
  RSXHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
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
      // RS hook 可能在 send 之前修改了 URL
      // 检查 _url 是否被 RS 修改（追加了 query）
      if (self._url && self._url.includes('r20SZOQm=')) {
        var match = self._url.match(/r20SZOQm=([^&]+)/);
        if (match) {
          queryCapture.value = match[1];
          queryCapture.url = self._url;
          queryCapture.method = self._method;
        }
      }
      // 异步模拟响应
      Promise.resolve().then(function() {
        // 再次检查（RS 可能在微任务中修改）
        if (self._url && self._url.includes('r20SZOQm=')) {
          var match2 = self._url.match(/r20SZOQm=([^&]+)/);
          if (match2) {
            queryCapture.value = match2[1];
            queryCapture.url = self._url;
          }
        }
        self.readyState = 2;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        self.readyState = 3;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        self.readyState = 4;
        self.status = 200;
        self.responseText = '{"status":0,"message":"Success","data":{}}';
        self.responseURL = self._url;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        if (self.onload) { try { self.onload(); } catch(e) {} }
      });
    },
    setRequestHeader: function(k, v) { if (!this._headers) this._headers = {}; this._headers[k] = v; },
    abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; },
    getResponseHeader: function() { return null; },
    addEventListener: function(type, fn) {
      if (type === 'load') this.onload = fn;
      if (type === 'readystatechange') { var orig = this.onreadystatechange; this.onreadystatechange = function() { try { if (orig) orig(); } catch(e) {} fn(); }; }
    },
    removeEventListener: function() {},
    upload: { addEventListener: function() {}, removeEventListener: function() {} },
  };

  // 用 buildEnv 创建环境，但替换 XHR
  const env = buildEnv({ nsd, cd }, { outerJsCode, seedCookie: oCookie, timeout: 30000 });
  
  // 替换 XHR 为原型模式
  env.sandbox.XMLHttpRequest = RSXHR;
  
  // 运行外层 VM — 第一遍：生成 cookie
  console.log('Running outer VM (pass 1 - cookie gen)...');
  try {
    vm.runInContext(outerJsCode, env.proxied, { timeout: 30000, filename: 'outer.js' });
  } catch(e) {
    console.log('Outer VM pass 1 error:', e.message.substring(0, 100));
  }

  await new Promise(r => setTimeout(r, 2000));
  console.log('Pass 1 cookies:', env.captured.cookies.length);

  // 第二遍：cookie 已存在，RS 应启用 query 生成
  console.log('\nRunning outer VM (pass 2 - with cookie)...');
  // 检查 document.cookie 在 pass 2 之前的状态
  var cookieBeforePass2 = vm.runInContext('document.cookie', env.proxied);
  console.log('Cookie before pass 2:', cookieBeforePass2.substring(0, 80));
  console.log('Has P cookie:', cookieBeforePass2.includes('P='));
  
  try {
    vm.runInContext(outerJsCode, env.proxied, { timeout: 30000, filename: 'outer2.js' });
    console.log('Pass 2 executed OK');
  } catch(e) {
    console.log('Pass 2 error:', e.message.substring(0, 100));
  }
  await new Promise(r => setTimeout(r, 3000));
  
  var cookieAfterPass2 = vm.runInContext('document.cookie', env.proxied);
  console.log('Cookie after pass 2 (full):', cookieAfterPass2);
  console.log('Cookie length:', cookieAfterPass2.length);
  console.log('Has NP cookie:', cookieAfterPass2.includes('aoU85Lxl9xxNP='));
  console.log('All captured cookies:');
  env.captured.cookies.forEach(function(c, i) { console.log('  [' + i + ']', c.substring(0, 100)); });
  
  // 等待异步操作完成
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('\nCookies:', env.captured.cookies.length);
  env.captured.cookies.forEach(c => console.log('  ' + c.substring(0, 60)));
  
  // 检查 RS 是否 hook 了 XHR prototype
  const openStr = RSXHR.prototype.open.toString();
  const sendStr = RSXHR.prototype.send.toString();
  console.log('\nXHR.open hooked:', !openStr.includes('_method'));

  // RS 在 open 中设置了一个函数（trampoline）在实例上
  // 提取这个函数并直接调用它来生成 query
  console.log('\n--- Extracting RS query function ---');
  try {
    var xhr_q = new RSXHR();
    // 用 RS hooked open
    RSXHR.prototype.open.call(xhr_q, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    
    // 找到 RS 设置的函数属性
    var rsFn = null;
    var rsFnName = null;
    for (var k in xhr_q) {
      if (k.startsWith('_$') && typeof xhr_q[k] === 'function') {
        rsFn = xhr_q[k];
        rsFnName = k;
        console.log('Found RS function:', k);
        console.log('Source:', xhr_q[k].toString().substring(0, 200));
      }
    }
    
    if (rsFn) {
      // 这是一个 JSVMP trampoline: function _$xx(){var y=[N];push.apply(y,arguments);return VM.apply(this,y);}
      // N 是字节码偏移
      // 直接调用它，传入 URL 和 body
      console.log('\nCalling RS function directly...');
      
      // 尝试不同的参数组合
      var attempts = [
        ['url only', '/px-gateway/GatewayConfig/getGatewayConfig'],
        ['url+body', '/px-gateway/GatewayConfig/getGatewayConfig', '{}'],
        ['method+url', 'POST', '/px-gateway/GatewayConfig/getGatewayConfig'],
        ['method+url+body', 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', '{}'],
        ['xhr instance', xhr_q],
        ['no args'],
      ];
      
      for (var attempt of attempts) {
        try {
          var label = attempt[0];
          var args = attempt.slice(1);
          var result = rsFn.apply(xhr_q, args);
          var resultStr = typeof result === 'string' ? result.substring(0, 80) : 
                          typeof result === 'number' ? String(result) :
                          typeof result === 'undefined' ? 'undefined' :
                          JSON.stringify(result)?.substring(0, 80) || typeof result;
          console.log('  ' + label + ':', resultStr);
          
          // 如果结果是字符串且包含 query 特征
          if (typeof result === 'string' && result.length > 20) {
            console.log('    POTENTIAL QUERY!', result.substring(0, 60));
            queryCapture.value = result;
          }
        } catch(e) {
          console.log('  ' + attempt[0] + ' error:', e.message.substring(0, 60));
        }
      }
    }
    
    // 也检查 RS 设置的 boolean 属性
    for (var k in xhr_q) {
      if (k.startsWith('_$') && typeof xhr_q[k] === 'boolean') {
        console.log('RS bool:', k, '=', xhr_q[k]);
      }
    }
  } catch(e) {
    console.log('Extract error:', e.message);
  }
  
  // 如果 RS hook 了 prototype，尝试发 XHR POST
  console.log('\n--- Attempting XHR POST ---');
  try {
    var xhr = new env.proxied.XMLHttpRequest();
    xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    console.log('After open: _url=' + xhr._url + ' readyState=' + xhr.readyState);
    
    // 检查 RS 是否在 open 时就修改了 URL
    if (xhr._url && xhr._url.includes('r20SZOQm=')) {
      console.log('QUERY FOUND in open!');
    }
    
    xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    xhr.send('{}');
    console.log('After send: _url=' + xhr._url);
    
    // 等待异步
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('After async: _url=' + xhr._url + ' readyState=' + xhr.readyState);
    console.log('Query captured:', queryCapture.value ? queryCapture.value.substring(0, 50) + '...' : 'null');
    
    // 检查 xhr 上所有属性
    var allProps = [];
    for (var k in xhr) {
      var v = xhr[k];
      var s = typeof v === 'function' ? '[fn]' : typeof v === 'string' ? v.substring(0, 40) : String(v).substring(0, 20);
      allProps.push(k + '=' + s);
    }
    console.log('XHR props:', allProps.join(', '));
  } catch(e) {
    console.log('XHR error:', e.message);
  }
  
  // 如果没有捕获到 query，尝试更完整的 XHR 设置
  if (!queryCapture.value || queryCapture.value === '/px-gateway/GatewayConfig/getGatewayConfig') {
    queryCapture.value = null;
    console.log('\n--- Comprehensive XHR attempt ---');
    
    // 找到 RS 设置的 boolean flag 并强制为 true
    // 同时确保所有条件都满足
    
    try {
      var xhr_c = new RSXHR();
      // RS hooked open
      RSXHR.prototype.open.call(xhr_c, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      
      // 找到 boolean flag
      var boolFlagName = null;
      for (var k in xhr_c) {
        if (k.startsWith('_$') && typeof xhr_c[k] === 'boolean') {
          boolFlagName = k;
          console.log('Boolean flag:', k, '=', xhr_c[k]);
        }
      }
      
      // 强制 flag = true
      if (boolFlagName) xhr_c[boolFlagName] = true;
      
      // 设置更多属性模拟真实 XHR
      xhr_c.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
      xhr_c.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr_c.withCredentials = true;
      
      // 设置事件处理器
      xhr_c.onreadystatechange = function() {
        console.log('[CB] readyState=' + xhr_c.readyState + ' _url=' + xhr_c._url);
      };
      xhr_c.onload = function() {
        console.log('[CB] load _url=' + xhr_c._url);
      };
      xhr_c.addEventListener('load', function() {
        console.log('[CB] addEventListener load _url=' + xhr_c._url);
      });
      
      // 现在调用 RS hooked send
      console.log('Before send: _url=' + xhr_c._url);
      if (boolFlagName) console.log('Flag ' + boolFlagName + '=' + xhr_c[boolFlagName]);
      
      RSXHR.prototype.send.call(xhr_c, '{}');
      
      console.log('After send: _url=' + xhr_c._url);
      
      // 检查所有属性
      for (var k in xhr_c) {
        if (typeof xhr_c[k] === 'string' && xhr_c[k].length > 5) {
          console.log('  prop ' + k + ':', xhr_c[k].substring(0, 60));
        }
      }
      
      // 检查 query
      if (xhr_c._url && xhr_c._url.includes('r20SZOQm=')) {
        var match = xhr_c._url.match(/r20SZOQm=([^&]+)/);
        if (match) {
          queryCapture.value = match[1];
          console.log('QUERY FOUND:', match[1].substring(0, 50));
        }
      }
    } catch(e) {
      console.log('Comprehensive error:', e.message.substring(0, 100));
    }
    
    // 如果还是没有，尝试在 vm context 内部执行
    if (!queryCapture.value) {
      console.log('\n--- In-context XHR attempt ---');
      try {
        // 在 vm context 内部创建 XHR 并发送
        var code = [
          'try {',
          '  var xhr = new XMLHttpRequest();',
          '  xhr.open("POST", "/px-gateway/GatewayConfig/getGatewayConfig", true);',
          '  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");',
          '  var origUrl = xhr._url || "";',
          '  xhr.send("{}");',
          '  var afterUrl = xhr._url || "";',
          '  JSON.stringify({ origUrl: origUrl, afterUrl: afterUrl, hasQuery: afterUrl.indexOf("r20SZOQm") >= 0 });',
          '} catch(e) {',
          '  JSON.stringify({ error: e.message.substring(0, 80) });',
          '}',
        ].join('\n');
        
        var result = vm.runInContext(code, env.proxied, { timeout: 5000 });
        console.log('In-context result:', result);
      } catch(e) {
        console.log('In-context error:', e.message);
      }
    }
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
