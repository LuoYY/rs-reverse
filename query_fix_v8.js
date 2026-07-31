/**
 * query_fix_v8.js — 统一分析所有 3 个异常（会话一致）
 * 
 * 改进：在同一会话中完成所有步骤
 * 1. 获取动态代码
 * 2. Patch catch blocks
 * 3. 执行 + 触发 trampoline
 * 4. 分析异常 → 提取函数名
 * 5. 在同一份 patched 代码中找到函数定义
 * 6. 插入变量导出
 * 7. 重新执行
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

function makeAnchorEl() {
  var el = { tagName: 'A', nodeName: 'A', nodeType: 1, style: new Proxy({}, { get: () => '', set: () => true }), children: [], childNodes: [],
    setAttribute: function(name, val) { if (name === 'href') this.href = String(val); },
    getAttribute: function(name) { if (name === 'href') return this._href || ''; return null; },
    removeAttribute() {}, appendChild(c) { return c; }, removeChild(c) { return c; },
    addEventListener() {}, removeEventListener() {}, _href: '', _url: null };
  Object.defineProperty(el, 'href', { get: function() { return this._href; }, set: function(v) { this._href = String(v);
    try { var b = 'https://pmos.xj.sgcc.com.cn:20080'; try { this._url = new URL(this._href, b); } catch(e) { this._url = { href: this._href, protocol: '', host: '', hostname: '', port: '', pathname: this._href, search: '', hash: '', origin: b }; } } catch(e) { this._url = null; } }, configurable: true });
  ['protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'origin', 'username', 'password'].forEach(function(p) {
    Object.defineProperty(el, p, { get: function() { return this._url ? (this._url[p] || '') : ''; }, set: function(){}, configurable: true }); });
  el.innerHTML=''; el.innerText=''; el.textContent=''; el.className=''; el.id=''; el.clientWidth=0; el.clientHeight=0; el.offsetWidth=0; el.offsetHeight=0;
  el.getBoundingClientRect=function(){return{top:0,left:0,right:0,bottom:0,width:0,height:0};}; el.getElementsByTagName=function(){return[];}; el.querySelector=function(){return null;}; el.querySelectorAll=function(){return[];};
  el.cloneNode=function(){return makeAnchorEl();}; el.remove=function(){}; el.parentNode=null; el.parentElement=null; el.firstChild=null; el.lastChild=null; el.nextSibling=null;
  return el;
}

(async () => {
  console.log('=== 统一分析 3 个异常 v8 ===\n');

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

  // 获取动态代码
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  function RSXHR() {}
  RSXHR.prototype = { open: function(m,u) { this._url=String(u); this.readyState=1; }, send: function() { this.readyState=4; this.status=200; this.responseText='{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {}, getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {}, readyState:0, status:0, responseText:'', responseURL:'' };
  env1.sandbox.XMLHttpRequest = RSXHR;
  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  if (!dynCode) { console.log('FATAL: dynCode not captured'); process.exit(1); }
  console.log('Dynamic code:', dynCode.length, 'bytes');

  // Patch catch blocks
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched = dynCode;
  var match;
  var offset = 0;
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset;
    var insert = 'if(!window.__ce)window.__ce=[];try{window.__ce.push({msg:String(' + errVar + '&&' + errVar + '.message||' + errVar + ').substring(0,150),stack:String(' + errVar + '&&' + errVar + '.stack||"").substring(0,600)});}catch(_$ignore){}';
    patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
    offset += insert.length;
  }

  // 构建沙箱
  function buildSandbox() {
    var env = buildEnv({ nsd, cd }, { seedCookie });
    env.sandbox.document.createElement = function(tag) {
      if (String(tag).toLowerCase() === 'a') return makeAnchorEl();
      return env.sandbox.document.createElement.call(this, tag);
    };
    env.sandbox.document = new Proxy(env.sandbox.document, {
      get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
      set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
    });
    function RSX() {}
    RSX.prototype = {};
    for (var key in RSXHR.prototype) RSX.prototype[key] = RSXHR.prototype[key];
    env.sandbox.XMLHttpRequest = RSX;
    return env;
  }

  function runTrampoline(env, code) {
    var origEval = env.sandbox.eval;
    var done = false;
    env.sandbox.eval = function(c) {
      if (typeof c === 'string' && c.length > 50000 && !done) { done = true; return origEval.call(this, c); }
      return origEval.call(this, c);
    };
    try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env.proxied, { timeout: 30000 }); } catch(e) {}
    return new Promise(function(resolve) { setTimeout(resolve, 2000); }).then(function() {
      vm.runInContext('window.__ce = []', env.proxied);
      var RSX = env.sandbox.XMLHttpRequest;
      var xhr = new RSX();
      RSX.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
      var tramp = null;
      for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }
      var result = '';
      if (tramp) { try { result = tramp.call(xhr, '{}') || ''; } catch(e) {} }
      var catches = vm.runInContext('window.__ce || []', env.proxied);
      return { result: result, catches: catches, xhr: xhr };
    });
  }

  // Step 1: 执行获取异常
  var env2 = buildSandbox();
  var r1 = await runTrampoline(env2, patched);
  console.log('Result:', JSON.stringify(r1.result.substring(0, 40)), 'Catches:', r1.catches.length);
  
  // 提取所有异常的函数名
  var errorFuncs = [];
  var seen = new Set();
  r1.catches.forEach(function(c) {
    if (seen.has(c.msg)) return;
    seen.add(c.msg);
    var frameMatch = c.stack.match(/at\s+(\S+)\s+\(dyn\.js:(\d+):(\d+)\)/);
    if (frameMatch) {
      errorFuncs.push({ msg: c.msg.substring(0, 80), func: frameMatch[1], line: frameMatch[2], col: frameMatch[3] });
    }
  });
  console.log('\nError functions:');
  errorFuncs.forEach(function(e, i) { console.log('  [' + i + '] ' + e.func + ' — ' + e.msg); });

  // Step 2: 对每个出错函数，在 patched 代码中找到定义并插入变量导出
  var patched2 = patched;
  var totalInserted = 0;
  
  errorFuncs.forEach(function(err) {
    var escapedName = err.func.replace(/\$/g, '\\$');
    var funcRegex = new RegExp('function\\s+' + escapedName + '\\s*\\(([^)]*)\\)\\s*\\{', 'g');
    var funcMatch = funcRegex.exec(patched2);
    if (!funcMatch) return;
    
    var funcParams = funcMatch[1];
    var funcBodyStart = funcMatch.index + funcMatch[0].length + totalInserted;
    // 注意：totalInserted 已经在 patched2 中累积了
    // 但 funcMatch.index 是相对于当前 patched2 的
    // 所以插入位置应该是 funcMatch.index + funcMatch[0].length
    var insertPos = funcMatch.index + funcMatch[0].length;
    
    var params = funcParams.split(',').map(function(s) { return s.trim(); }).filter(function(p) { return p && p !== 'undefined'; });
    var exportCode = 'if(!window.__fn)window.__fn=[];try{window.__fn.push({fn:"' + err.func + '"';
    params.forEach(function(p) {
      exportCode += ',' + p + '_t:typeof ' + p + ',' + p + '_v:String(' + p + ').substring(0,200)';
    });
    exportCode += '});}catch(_$ign){}';
    
    patched2 = patched2.substring(0, insertPos) + exportCode + patched2.substring(insertPos);
    totalInserted += exportCode.length;
  });
  
  console.log('\nInserted exports for', totalInserted > 0 ? 'error functions' : 'no functions', 'total chars:', totalInserted);

  // Step 3: 执行 patched2
  var env3 = buildSandbox();
  var r2 = await runTrampoline(env3, patched2);
  console.log('\n=== After variable export ===');
  console.log('Result:', JSON.stringify(r2.result.substring(0, 80)), 'length:', r2.result.length);
  console.log('Catches:', r2.catches.length);
  
  var fnData = vm.runInContext('window.__fn || []', env3.proxied);
  console.log('\nFunction call data:', fnData.length);
  fnData.forEach(function(d, i) {
    console.log('\n[Call ' + i + '] fn:', d.fn);
    Object.keys(d).forEach(function(key) {
      if (key !== 'fn') console.log('  ' + key + ':', d[key]);
    });
  });
  
  // 检查 catches
  var seen2 = new Set();
  r2.catches.forEach(function(c) {
    if (seen2.has(c.msg)) return;
    seen2.add(c.msg);
    console.log('\n  Catch:', c.msg.substring(0, 100));
  });

  if (r2.result && r2.result.length > 10) {
    console.log('\n*** QUERY CAPTURED! ***');
    console.log('Query:', r2.result);
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
