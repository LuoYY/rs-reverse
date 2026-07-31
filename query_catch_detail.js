/**
 * query_catch_detail.js — catch 块详细 logging
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== Catch 详细 logging ===\n');

  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const client = new PmosXjClientProxy();
  await client.init();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;

  // Pass 1
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  function RSXHR() {}
  RSXHR.prototype = {
    open: function(m,u) { this._url=String(u); this.readyState=1; },
    send: function() { this.readyState=4; this.status=200; this.responseText='{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    readyState:0, status:0, responseText:'', responseURL:'',
  };
  env1.sandbox.XMLHttpRequest = RSXHR;
  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // Patch catch blocks — 记录 msg + stack
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched = dynCode;
  var match;
  var offset = 0;
  var patchCount = 0;
  
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset;
    var insert = 'if(!window.__ce)window.__ce=[];window.__ce.push(' + errVar + '&&' + errVar + '.message?' + errVar + '.message.substring(0,80):String(' + errVar + ').substring(0,80));';
    patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
    offset += insert.length;
    patchCount++;
  }
  console.log('Patched', patchCount, 'catch blocks');

  // 执行
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  env2.sandbox.XMLHttpRequest = RSXHR2;

  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, patched); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  vm.runInContext('window.__ce = []', env2.proxied);

  // 触发 trampoline
  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  if (tramp) {
    const result = tramp.call(xhr, '{}');
    console.log('\nResult: "' + String(result).substring(0, 40) + '"');

    const catches = vm.runInContext('window.__ce || []', env2.proxied);
    console.log('\n=== Catch logs: ' + catches.length + ' ===');
    
    // 去重并显示
    const unique = [...new Set(catches)];
    console.log('Unique:', unique.length);
    unique.forEach((e, i) => console.log('  [' + i + '] ' + e));
    
    // 现在尝试修复
    // 异常 0: charAt on null/undefined → 某个值是 null
    // 异常 1: undefined.length → 某个属性返回 undefined
    // 异常 2: undefined.call → 某个函数引用是 undefined  
    // 异常 3: XX[YY[27]] is not a function → 某个 API 不存在
    //
    // 方法：用 Proxy 包装沙箱中的关键对象
    // 当属性访问返回 undefined 时返回合理的默认值
    
    console.log('\n=== 尝试修复 ===');
    
    // 重新构建沙箱，添加更多 stub
    const env3 = buildEnv({ nsd, cd }, { seedCookie });
    
    // 增强沙箱环境
    var origDoc = env3.sandbox.document;
    // 用 Proxy 包装 document，缺失属性返回合理的默认值
    env3.sandbox.document = new Proxy(origDoc, {
      get: function(t, p) {
        if (p === 'cookie') return seedCookie;
        if (p in t) return t[p];
        // 缺失属性返回 undefined（不返回函数，避免 is not a function）
        return undefined;
      },
      set: function(t, p, v) {
        if (p === 'cookie' && String(v).indexOf('aoU85Lxl9xxNP=') >= 0) return true;
        t[p] = v; return true;
      }
    });
    
    // 增强 navigator
    var origNav = env3.sandbox.navigator;
    env3.sandbox.navigator = new Proxy(origNav, {
      get: function(t, p) {
        if (p in t) return t[p];
        // 缺失 navigator 属性
        if (p === 'sendBeacon') return function() { return true; };
        if (p === 'serviceWorker') return { controller: null, ready: Promise.resolve(), register: function() { return Promise.resolve(); } };
        if (p === 'permissions') return { query: function() { return Promise.resolve({ state: 'prompt' }); } };
        if (p === 'mediaDevices') return { enumerateDevices: function() { return Promise.resolve([]); }, getUserMedia: function() { return Promise.reject(); } };
        if (p === 'connection') return { effectiveType: '4g', rtt: 50, downlink: 10, addEventListener: function(){}, removeEventListener: function(){} };
        if (p === 'storage') return { estimate: function() { return Promise.resolve({ quota: 0, usage: 0 }); } };
        if (p === 'credentials') return { get: function() { return Promise.resolve(); }, store: function() { return Promise.resolve(); } };
        if (p === 'clipboard') return { readText: function() { return Promise.resolve(''); }, writeText: function() { return Promise.resolve(); } };
        if (p === 'locks') return { request: function() { return Promise.resolve(); }, query: function() { return Promise.resolve({}); } };
        if (p === 'wakeLock') return { request: function() { return Promise.resolve(); } };
        if (p === 'usb') return { getDevices: function() { return Promise.resolve([]); } };
        if (p === 'bluetooth') return { getAvailability: function() { return Promise.resolve(false); } };
        if (p === 'geolocation') return { getCurrentPosition: function(){}, watchPosition: function(){return 0;}, clearWatch: function(){} };
        return undefined;
      }
    });
    
    // 增强 window/screen 等
    env3.sandbox.XMLHttpRequest = RSXHR;
    
    // 执行 patched 代码
    const origEval3 = env3.sandbox.eval;
    let done3 = false;
    env3.sandbox.eval = function(code) {
      if (typeof code === 'string' && code.length > 50000 && !done3) { done3 = true; return origEval3.call(this, patched); }
      return origEval3.call(this, code);
    };
    try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env3.proxied, { timeout: 30000 }); } catch(e) {}
    await new Promise(r => setTimeout(r, 2000));
    
    vm.runInContext('window.__ce = []', env3.proxied);
    
    // 触发 trampoline
    var xhr3 = new RSXHR();
    RSXHR.prototype.open.call(xhr3, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    for (var k in xhr3) { if (k.indexOf('_$') === 0 && typeof xhr3[k] === 'boolean') xhr3[k] = true; }
    var tramp3 = null;
    for (var k in xhr3) { if (k.indexOf('_$') === 0 && typeof xhr3[k] === 'function') { tramp3 = xhr3[k]; break; } }
    
    if (tramp3) {
      var result3 = tramp3.call(xhr3, '{}');
      console.log('\nEnhanced result: "' + String(result3).substring(0, 80) + '"');
      
      var catches3 = vm.runInContext('window.__ce || []', env3.proxied);
      console.log('Catches:', catches3.length);
      var unique3 = [...new Set(catches3)];
      unique3.forEach(function(e, i) { console.log('  [' + i + '] ' + e); });
      
      if (result3 && typeof result3 === 'string' && result3.length > 10) {
        console.log('\n*** QUERY CAPTURED! ***');
        console.log('Query:', result3);
        fs.writeFileSync(
          path.join(ROOT, 'output/capture-20080/query-captured.json'),
          JSON.stringify({ query: result3, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
        );
        console.log('Saved!');
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
