/**
 * query_fix_v9.js — 修复 XHR 遗留问题 + 深入分析
 *
 * 从 v8 发现：Catches: 0！
 * 这说明 createElement('a') 修复后，有时异常完全消失
 * 但 result 仍然是 ""
 *
 * 可能原因：
 * 1. trampoline 正常执行但返回空字符串（非异常路径）
 * 2. VM 正常退出但 args[5]="" 被正常逻辑设置
 * 3. 需要检查 trampoline 是否真的被正确调用
 *
 * 新策略：
 * 1. 检查 trampoline 的返回值是否真的来自 VM
 * 2. 在 VM 退出后检查 args[5] 的值
 * 3. 可能需要检查 XHR 上的其他 hook 函数
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
  console.log('=== 深入分析 trampoline 返回空字符串 v9 ===\n');

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

  // 构建沙箱
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

  // 执行原始动态代码（不 patch catch）
  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, code); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 检查 XHR 上的所有 RS 属性
  console.log('\n=== XHR 属性分析 ===');
  var xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  
  var rsProps = {};
  for (var k in xhr) {
    if (k.startsWith('_$')) {
      rsProps[k] = { type: typeof xhr[k], value: typeof xhr[k] === 'function' ? 'fn' : String(xhr[k]).substring(0, 50) };
    }
  }
  console.log('RS properties on XHR:', Object.keys(rsProps).length);
  Object.keys(rsProps).forEach(function(k) {
    console.log('  ' + k + ':', rsProps[k].type, rsProps[k].value);
  });

  // 找到 trampoline 函数
  var tramp = null;
  var trampName = null;
  for (var k in xhr) {
    if (k.startsWith('_$') && typeof xhr[k] === 'function') {
      tramp = xhr[k];
      trampName = k;
      break;
    }
  }
  console.log('\nTrampoline:', trampName);

  // 检查 trampoline 的 toString
  if (tramp) {
    var trampStr = tramp.toString();
    console.log('Trampoline toString (first 300):', trampStr.substring(0, 300));
    console.log('Trampoline length:', trampStr.length);
  }

  // 检查 RS 是否 hook 了 XMLHttpRequest.prototype
  console.log('\n=== XMLHttpRequest.prototype 分析 ===');
  var proto = RSXHR2.prototype;
  var protoKeys = Object.getOwnPropertyNames(proto).filter(function(k) { return k.startsWith('_$'); });
  console.log('RS properties on prototype:', protoKeys.length);
  protoKeys.forEach(function(k) {
    var desc = Object.getOwnPropertyDescriptor(proto, k);
    console.log('  ' + k + ':', typeof desc.value, desc.value ? String(desc.value).substring(0, 50) : (desc.get ? 'getter' : 'none'));
  });

  // 检查 window.$_ts
  console.log('\n=== window.$_ts 分析 ===');
  var tsKeys = vm.runInContext('Object.keys(window.$_ts || {})', env2.proxied);
  console.log('$_ts keys:', tsKeys);
  var tsValues = vm.runInContext('JSON.stringify(window.$_ts, null, 2).substring(0, 500)', env2.proxied);
  console.log('$_ts:', tsValues);

  // 尝试调用 trampoline 并检查返回值
  console.log('\n=== 调用 trampoline ===');
  // 设置所有 boolean 为 true
  for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  
  var result = '';
  try { result = tramp.call(xhr, '{}') || ''; } catch(e) { console.log('Threw:', e.message); }
  console.log('Result:', JSON.stringify(result.substring(0, 80)));
  console.log('Result length:', result.length);

  // 检查 trampoline 是否有其他参数
  console.log('\n=== 检查 trampoline 参数 ===');
  // RS 的 trampoline 可能需要多个参数
  // 通常 trampoline(xhr, body) 或 trampoline(body, url, method)
  var result2 = '';
  try { result2 = tramp.call(xhr, '{}', '/px-gateway/GatewayConfig/getGatewayConfig', 'POST') || ''; } catch(e) { console.log('Threw (3 args):', e.message); }
  console.log('Result (3 args):', JSON.stringify(result2.substring(0, 80)));

  // 检查 send 方法是否被 hook
  console.log('\n=== 检查 send hook ===');
  // RS 通常 hook XMLHttpRequest.prototype.send
  // 在 send 内部生成 query 并追加到 URL
  var sendFn = RSXHR2.prototype.send;
  console.log('send function:', typeof sendFn, sendFn ? sendFn.toString().substring(0, 200) : 'null');

  // 检查 open 方法是否被 hook
  var openFn = RSXHR2.prototype.open;
  console.log('open function:', typeof openFn, openFn ? openFn.toString().substring(0, 200) : 'null');

  // 检查 RS 是否有全局 hook 变量
  console.log('\n=== 检查 RS 全局变量 ===');
  var rsGlobals = vm.runInContext('Object.keys(window).filter(function(k){return k.indexOf("_$")===0 || k.indexOf("$_ts")===0;}).slice(0,30)', env2.proxied);
  console.log('RS globals:', rsGlobals);

  // 检查是否有 sendBeacon 或 fetch hook
  console.log('\n=== 检查 fetch/XHR hook ===');
  var fetchFn = vm.runInContext('typeof window.fetch', env2.proxied);
  console.log('fetch type:', fetchFn);
  
  // 检查 XMLHttpRequest 是否被替换
  var xhrStr = vm.runInContext('window.XMLHttpRequest.toString().substring(0, 200)', env2.proxied);
  console.log('XMLHttpRequest:', xhrStr);

  // 关键：检查 RS 是否在 send 时追加 query
  // 模拟完整的 XHR 生命周期
  console.log('\n=== 模拟完整 XHR 生命周期 ===');
  var xhr2 = new RSXHR2();
  console.log('Before open - RS props:', Object.keys(xhr2).filter(function(k){return k.indexOf('_$')===0;}).length);
  
  xhr2.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  console.log('After open - RS props:', Object.keys(xhr2).filter(function(k){return k.indexOf('_$')===0;}).length);
  console.log('After open - url:', xhr2._url);
  
  // 检查 open 后 RS 设置了什么
  var openProps = {};
  for (var k in xhr2) {
    if (k.startsWith('_$')) {
      openProps[k] = typeof xhr2[k];
    }
  }
  console.log('After open RS props:', JSON.stringify(openProps));
  
  // 尝试 send
  console.log('\nTrying send...');
  try {
    xhr2.setRequestHeader('Content-Type', 'application/json');
    xhr2.send('{}');
    console.log('After send - url:', xhr2._url);
    console.log('After send - responseText:', xhr2.responseText);
  } catch(e) {
    console.log('Send threw:', e.message);
  }

  // 检查 URL 是否被修改
  console.log('\nFinal URL:', xhr2._url);

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
