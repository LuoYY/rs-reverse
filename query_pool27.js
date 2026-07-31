/**
 * query_pool27.js — 获取常量池 _$b1[27] 的值
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 获取常量池 pool[27] ===\n');

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

  // Step 1: 获取异常消息中的常量池变量名
  console.log('[Step 1] 获取异常消息...');
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched1 = dynCode;
  var match;
  var offset = 0;
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset;
    var insert = 'if(!window.__ce)window.__ce=[];window.__ce.push(' + errVar + '&&' + errVar + '.message?' + errVar + '.message.substring(0,100):String(' + errVar + ').substring(0,100));';
    patched1 = patched1.substring(0, insertPos) + insert + patched1.substring(insertPos);
    offset += insert.length;
  }

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
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, patched1); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  vm.runInContext('window.__ce = []', env2.proxied);

  var xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  var tramp = null;
  for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  var poolVar = null;
  if (tramp) {
    tramp.call(xhr, '{}');
    var catches = vm.runInContext('window.__ce || []', env2.proxied);
    var unique = [...new Set(catches)];
    console.log('Exceptions:', unique.length);
    unique.forEach(function(e, i) { console.log('  [' + i + '] ' + e); });

    var err3 = unique.find(function(e) { return e.indexOf('[27]') >= 0; });
    if (err3) {
      var varMatch = err3.match(/(_\$[$a-zA-Z0-9]+)\[(_\$[$a-zA-Z0-9]+)\[27\]\]/);
      if (varMatch) {
        poolVar = varMatch[2];
        console.log('\nPool var:', poolVar);
      }
    }
  }

  // Step 2: 在 poolVar 赋值后添加 window.__pool = poolVar
  if (poolVar) {
    console.log('\n[Step 2] 提取 pool[27]...');
    
    // 搜索 poolVar=_$ 赋值
    var poolAssignStr = poolVar + '=';
    var poolPos = dynCode.indexOf(poolAssignStr);
    console.log('Pool assignment at:', poolPos);
    
    if (poolPos >= 0) {
      console.log('Context:', dynCode.substring(poolPos, poolPos + 40));
      
      // 找到语句结束
      var assignEnd = poolPos + poolAssignStr.length;
      while (assignEnd < dynCode.length && dynCode[assignEnd] !== ';' && dynCode[assignEnd] !== ',' && dynCode[assignEnd] !== '}') assignEnd++;
      
      // 构造 patched
      var patched2 = dynCode.substring(0, assignEnd + 1) + 'window.__pool=' + poolVar + ';' + dynCode.substring(assignEnd + 1);
      
      // 执行
      const env3 = buildEnv({ nsd, cd }, { seedCookie });
      env3.sandbox.document = new Proxy(env3.sandbox.document, {
        get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
        set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
      });
      function RSXHR3() {}
      RSXHR3.prototype = {};
      for (const key in RSXHR.prototype) RSXHR3.prototype[key] = RSXHR.prototype[key];
      env3.sandbox.XMLHttpRequest = RSXHR3;
      const origEval3 = env3.sandbox.eval;
      let done3 = false;
      env3.sandbox.eval = function(code) {
        if (typeof code === 'string' && code.length > 50000 && !done3) { done3 = true; return origEval3.call(this, patched2); }
        return origEval3.call(this, code);
      };
      try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env3.proxied, { timeout: 30000 }); } catch(e) {}
      await new Promise(r => setTimeout(r, 2000));
      
      // 获取 pool[27]
      var poolType = vm.runInContext('typeof window.__pool', env3.proxied);
      console.log('\nPool type:', poolType);
      
      if (poolType !== 'undefined') {
        var pool27 = vm.runInContext('window.__pool[27]', env3.proxied);
        console.log('pool[27]:', JSON.stringify(pool27));
        
        var poolLen = vm.runInContext('window.__pool.length', env3.proxied);
        console.log('pool length:', poolLen);
        
        // 显示前 30 个元素
        var poolHead = vm.runInContext('JSON.stringify(window.__pool.slice(0, 30))', env3.proxied);
        console.log('pool[0..29]:', poolHead?.substring(0, 300));
        
        // pool[27] 是缺失的 API 名
        // 在沙箱中补全该 API
        console.log('\n=== 分析 ===');
        console.log('pool[27] = "' + pool27 + '"');
        console.log('这是 RS 尝试调��的浏览器 API 名');
        console.log('沙箱中缺少该 API → 异常 → query 生成失败');
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
