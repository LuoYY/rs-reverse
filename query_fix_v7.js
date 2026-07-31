/**
 * query_fix_v7.js — 分析 _$$7 函数和 _$lR 对象
 *
 * 异常 3: _$lR[_$hF[27]](0,_$jX[2]) is not a function
 * 在 _$$7 函数中: function _$$7(_$_y,_$lR){_$lR=_$cs(_$lR[_$hF[27]](0,_$jX[2])),...}
 * 
 * _$lR 是函数参数，_$hF[27] 是方法名
 * _$lR[_$hF[27]] 调用失败 → _$lR 不是字符串/数组，或缺少这个方法
 *
 * _$$7 被 VM dispatcher (_$id) 调用
 * _$lR 可能是某个 DOM 属性返回值
 *
 * 方法：在 _$$7 函数中插入变量导出
 * 同时需要理解 _$$7 被什么调用，传了什么参数
 *
 * 同时分析异常 1 和 2（VM dispatcher 内部）
 * 异常 1: _$at[_$kj] → undefined.length（VM stack 操作）
 * 异常 2: _$at[_$eT] → undefined.call()（VM 方法调用）
 * 这两个异常在 VM dispatcher 的 case 分支中
 * _$at 是从 VM stack 弹出的值，是 undefined
 * 说明 VM 执行过程中某个操作产生了 undefined
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

function makeAnchorEl() {
  var el = {
    tagName: 'A', nodeName: 'A', nodeType: 1,
    style: new Proxy({}, { get: () => '', set: () => true }),
    children: [], childNodes: [],
    setAttribute: function(name, val) { if (name === 'href') this.href = String(val); },
    getAttribute: function(name) { if (name === 'href') return this._href || ''; return null; },
    removeAttribute() {},
    appendChild(c) { return c; }, removeChild(c) { return c; },
    addEventListener() {}, removeEventListener() {},
    _href: '', _url: null,
  };
  Object.defineProperty(el, 'href', {
    get: function() { return this._href; },
    set: function(v) {
      this._href = String(v);
      try {
        var base = 'https://pmos.xj.sgcc.com.cn:20080';
        try { this._url = new URL(this._href, base); }
        catch(e) { this._url = { href: this._href, protocol: '', host: '', hostname: '', port: '', pathname: this._href, search: '', hash: '', origin: base }; }
      } catch(e) { this._url = null; }
    },
    configurable: true,
  });
  ['protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'origin', 'username', 'password'].forEach(function(prop) {
    Object.defineProperty(el, prop, { get: function() { return this._url ? (this._url[prop] || '') : ''; }, set: function(){}, configurable: true });
  });
  el.innerHTML = ''; el.innerText = ''; el.textContent = ''; el.className = ''; el.id = '';
  el.clientWidth = 0; el.clientHeight = 0; el.offsetWidth = 0; el.offsetHeight = 0;
  el.getBoundingClientRect = function() { return {top:0,left:0,right:0,bottom:0,width:0,height:0}; };
  el.getElementsByTagName = function() { return []; };
  el.querySelector = function() { return null; };
  el.querySelectorAll = function() { return []; };
  el.cloneNode = function() { return makeAnchorEl(); };
  el.remove = function() {};
  el.parentNode = null; el.parentElement = null;
  el.firstChild = null; el.lastChild = null; el.nextSibling = null;
  return el;
}

(async () => {
  console.log('=== 分析 _$$7 和 VM dispatcher 异常 v7 ===\n');

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
  if (!dynCode) { console.log('FATAL: dynCode not captured'); process.exit(1); }
  console.log('Dynamic code:', dynCode.length, 'bytes');

  // 在 _$$7 函数中插入变量导出
  // _$$7 函数签名: function _$$7(_$_y,_$lR)
  // 在函数体开头插入: window.__fn7_data.push({lR_type: typeof _$lR, lR_val: ...})
  
  // 但函数名每次会话不同！需要在同一会话中找到函数名
  // 方法：先执行获取异常 → 提取函数名 → 在代码中搜索 → patch → 重新执行
  
  // Step 1: 执行获取异常
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched1 = dynCode;
  var match;
  var offset1 = 0;
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset1;
    var insert = 'if(!window.__ce)window.__ce=[];try{window.__ce.push({msg:String(' + errVar + '&&' + errVar + '.message||' + errVar + ').substring(0,150),stack:String(' + errVar + '&&' + errVar + '.stack||"").substring(0,600)});}catch(_$ignore){}';
    patched1 = patched1.substring(0, insertPos) + insert + patched1.substring(insertPos);
    offset1 += insert.length;
  }

  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  env2.sandbox.document.createElement = function(tag) {
    if (String(tag).toLowerCase() === 'a') return makeAnchorEl();
    return env2.sandbox.document.createElement.call(this, tag);
  };
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  env2.sandbox.XMLHttpRequest = RSXHR2;

  const origEval2 = env2.sandbox.eval;
  let done1 = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done1) { done1 = true; return origEval2.call(this, patched1); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  vm.runInContext('window.__ce = []', env2.proxied);

  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }
  if (tramp) { try { tramp.call(xhr, '{}'); } catch(e) {} }

  var catches = vm.runInContext('window.__ce || []', env2.proxied);
  
  // 找到 not-a-function 异常
  var notFnErr = catches.find(function(c) { return c.msg.indexOf('is not a function') >= 0; });
  if (!notFnErr) { console.log('No not-a-function error'); process.exit(0); }
  
  // 提取出错函数名
  var frameMatch = notFnErr.stack.match(/at\s+(\S+)\s+\(dyn\.js:/);
  var errFuncName = frameMatch ? frameMatch[1] : null;
  console.log('Error function:', errFuncName);
  console.log('Error msg:', notFnErr.msg);

  // 在 patched1 代码中找到这个函数
  var escapedName = errFuncName.replace(/\$/g, '\\$');
  var funcRegex = new RegExp('function\\s+' + escapedName + '\\s*\\(([^)]*)\\)\\s*\\{', 'g');
  var funcMatch = funcRegex.exec(patched1);
  if (!funcMatch) { console.log('Function not found in patched code'); process.exit(0); }
  
  var funcParams = funcMatch[1];
  var funcBodyStart = funcMatch.index + funcMatch[0].length;
  console.log('Function params:', funcParams);
  console.log('Function body starts at:', funcBodyStart);
  
  // 提取函数体
  var depth = 1;
  var funcEnd = funcBodyStart;
  for (var i = funcBodyStart; i < patched1.length; i++) {
    if (patched1[i] === '{') depth++;
    else if (patched1[i] === '}') { depth--; if (depth === 0) { funcEnd = i; break; } }
  }
  console.log('Function body (first 300):', patched1.substring(funcMatch.index, funcMatch.index + 300));

  // 在函数体开头插入变量导出
  var params = funcParams.split(',').map(function(s) { return s.trim(); }).filter(function(p) { return p && p !== 'undefined'; });
  var exportCode = 'if(!window.__fn_data)window.__fn_data=[];try{var __info={func:"' + errFuncName + '";';
  params.forEach(function(p) {
    exportCode += p + '_type:typeof ' + p + ',' + p + '_val:String(' + p + ').substring(0,200),';
    // 如果是对象，记录 keys
    exportCode += p + '_keys:(typeof ' + p + '==="object"&&' + p + ')?Object.keys(' + p + ').slice(0,30).join(","):"null",';
  });
  exportCode += 'stack:(new Error()).stack.split("\\n").slice(1,6).join(" | ")};window.__fn_data.push(__info);}catch(_$ignore){}';
  
  var patched2 = patched1.substring(0, funcBodyStart) + exportCode + patched1.substring(funcBodyStart);

  // Step 2: 执行 patched2
  console.log('\n=== 执行带变量导出的代码 ===');
  const env3 = buildEnv({ nsd, cd }, { seedCookie });
  env3.sandbox.document.createElement = function(tag) {
    if (String(tag).toLowerCase() === 'a') return makeAnchorEl();
    return env3.sandbox.document.createElement.call(this, tag);
  };
  env3.sandbox.document = new Proxy(env3.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR3() {}
  RSXHR3.prototype = {};
  for (const key in RSXHR.prototype) RSXHR3.prototype[key] = RSXHR.prototype[key];
  env3.sandbox.XMLHttpRequest = RSXHR3;

  const origEval3 = env3.sandbox.eval;
  let done2 = false;
  env3.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done2) { done2 = true; return origEval3.call(this, patched2); }
    return origEval3.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env3.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  vm.runInContext('window.__ce = []; window.__fn_data = []', env3.proxied);

  // 触发
  var xhr3 = new RSXHR3();
  RSXHR3.prototype.open.call(xhr3, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (var k in xhr3) { if (k.startsWith('_$') && typeof xhr3[k] === 'boolean') xhr3[k] = true; }
  var tramp3 = null;
  for (var k in xhr3) { if (k.startsWith('_$') && typeof xhr3[k] === 'function') { tramp3 = xhr3[k]; break; } }
  if (tramp3) { try { tramp3.call(xhr3, '{}'); } catch(e) {} }

  // 检查导出
  var fnData = vm.runInContext('window.__fn_data || []', env3.proxied);
  console.log('\n=== Function call data:', fnData.length, '===');
  fnData.forEach(function(d, i) {
    console.log('\n[Call ' + i + ']');
    Object.keys(d).forEach(function(key) {
      if (key !== 'stack') {
        console.log('  ' + key + ':', d[key]);
      }
    });
    if (d.stack) console.log('  stack:', d.stack.substring(0, 200));
  });

  // 检查 catches
  var catches3 = vm.runInContext('window.__ce || []', env3.proxied);
  console.log('\nCatches:', catches3.length);
  var seen = new Set();
  catches3.forEach(function(c) {
    if (seen.has(c.msg)) return;
    seen.add(c.msg);
    console.log('  -', c.msg.substring(0, 80));
  });

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
