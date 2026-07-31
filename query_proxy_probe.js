/**
 * query_proxy_probe.js — Proxy 探针定位缺失的 API
 *
 * 在 buildEnv 基础上，用 Proxy 包装 document/navigator/window
 * 当属性访问返回 undefined 时记录
 * 然后触发 trampoline → 找到缺失的 API → 补全 → 生成 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== Proxy 探针定位缺失 API ===\n');

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
  const gen = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${gen.name}=${gen.cookie}`;

  // Pass 1: 获取动态代码
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

  // 构建增强沙箱：Proxy 探针 + catch logging
  const env2 = buildEnv({ nsd, cd }, { seedCookie });

  // 用 Proxy 包装 document
  const origDoc = env2.sandbox.document;
  const missingProps = new Set();
  env2.sandbox.document = new Proxy(origDoc, {
    get(t, p) {
      if (p === 'cookie') return seedCookie;
      if (p in t) return t[p];
      // 记录缺失属性
      if (typeof p === 'string' && !p.startsWith('Symbol') && p.length < 50) {
        missingProps.add('document.' + p);
      }
      return undefined;
    },
    set(t, p, v) {
      if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true;
      t[p] = v; return true;
    }
  });

  // 用 Proxy 包装 navigator
  const origNav = env2.sandbox.navigator;
  env2.sandbox.navigator = new Proxy(origNav, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string' && p.length < 50) {
        missingProps.add('navigator.' + p);
      }
      return undefined;
    }
  });

  // 用 Proxy 包装 screen
  const origScreen = env2.sandbox.screen;
  env2.sandbox.screen = new Proxy(origScreen, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string' && p.length < 50) {
        missingProps.add('screen.' + p);
      }
      return undefined;
    }
  });

  // 原型 XHR
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  env2.sandbox.XMLHttpRequest = RSXHR2;

  // Patch catch blocks
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched = dynCode;
  var match;
  var offset = 0;
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset;
    var insert = 'if(!window.__ce)window.__ce=[];window.__ce.push(' + errVar + '&&' + errVar + '.message?' + errVar + '.message.substring(0,80):String(' + errVar + ').substring(0,80));';
    patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
    offset += insert.length;
  }

  // 执行
  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, patched); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 清空 catch log
  vm.runInContext('window.__ce = []', env2.proxied);
  vm.runInContext('window.__missing = []', env2.proxied);

  // 触发 trampoline
  console.log('[Step 1] 触发 trampoline...');
  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  if (tramp) {
    const result = tramp.call(xhr, '{}');
    console.log('Result: "' + String(result).substring(0, 40) + '"');

    // 检查 catch logs
    const catches = vm.runInContext('window.__ce || []', env2.proxied);
    console.log('\n=== Catches: ' + catches.length + ' ===');
    [...new Set(catches)].forEach((e, i) => console.log('  [' + i + '] ' + e));

    // 检查缺失属性
    console.log('\n=== Missing properties ===');
    console.log('Count:', missingProps.size);
    [...missingProps].sort().forEach(p => console.log('  ' + p));

    // 如果有缺失属性，尝试补全
    if (missingProps.size > 0) {
      console.log('\n=== 尝试补全 ===');

      // 重新构建沙箱，补全缺失的属性
      const env3 = buildEnv({ nsd, cd }, { seedCookie });

      // 补全 document 缺失属性
      const docProps = [...missingProps].filter(p => p.startsWith('document.'));
      docProps.forEach(p => {
        const name = p.replace('document.', '');
        // 根据属性名提供合理的默认值
        if (name.includes('getElementsBy') || name.includes('querySelector')) {
          env3.sandbox.document[name] = function() { return []; };
        } else if (name.includes('create')) {
          env3.sandbox.document[name] = function() {
            return { style: {}, setAttribute: function(){}, getAttribute: function(){return null;}, appendChild: function(){}, getElementsByTagName: function(){return [];}, addEventListener: function(){} };
          };
        } else if (name.includes('get')) {
          env3.sandbox.document[name] = function() { return null; };
        } else {
          env3.sandbox.document[name] = '';
        }
        console.log('  document.' + name + ' = ' + typeof env3.sandbox.document[name]);
      });

      // 补全 navigator 缺失属性
      const navProps = [...missingProps].filter(p => p.startsWith('navigator.'));
      navProps.forEach(p => {
        const name = p.replace('navigator.', '');
        if (name === 'sendBeacon') env3.sandbox.navigator[name] = function() { return true; };
        else if (name === 'serviceWorker') env3.sandbox.navigator[name] = { controller: null, ready: Promise.resolve() };
        else if (name === 'userAgentData') env3.sandbox.navigator[name] = { brands: [{brand:'Google Chrome',version:'131'}], mobile:false, platform:'macOS' };
        else env3.sandbox.navigator[name] = '';
        console.log('  navigator.' + name + ' = ' + typeof env3.sandbox.navigator[name]);
      });

      // 补全 screen 缺失属性
      const scrProps = [...missingProps].filter(p => p.startsWith('screen.'));
      scrProps.forEach(p => {
        const name = p.replace('screen.', '');
        env3.sandbox.screen[name] = 0;
        console.log('  screen.' + name + ' = 0');
      });

      // 锁定 cookie
      env3.sandbox.document = new Proxy(env3.sandbox.document, {
        get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
        set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
      });

      function RSXHR3() {}
      RSXHR3.prototype = {};
      for (const key in RSXHR.prototype) RSXHR3.prototype[key] = RSXHR.prototype[key];
      env3.sandbox.XMLHttpRequest = RSXHR3;

      // 执行 patched
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
      var xhr3 = new RSXHR3();
      RSXHR3.prototype.open.call(xhr3, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      for (var k in xhr3) { if (k.indexOf('_$') === 0 && typeof xhr3[k] === 'boolean') xhr3[k] = true; }
      var tramp3 = null;
      for (var k in xhr3) { if (k.indexOf('_$') === 0 && typeof xhr3[k] === 'function') { tramp3 = xhr3[k]; break; } }

      if (tramp3) {
        var result3 = tramp3.call(xhr3, '{}');
        console.log('\n=== 补全后结果 ===');
        console.log('Result: "' + String(result3).substring(0, 80) + '"');
        console.log('Length:', typeof result3 === 'string' ? result3.length : 'N/A');

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
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
