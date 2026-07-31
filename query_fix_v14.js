/**
 * query_fix_v14.js — trampoline 是 VM 生成的闭包，不在动态代码文本中
 *
 * 从 v13 的关键发现：
 * 1. trampoline 函数 _$$t 在动态代码 pos 6623 找到
 * 2. 但函数体只有 18 个字符: "return[_$$s,_$$_];"
 * 3. 这不是真正的 trampoline！这只是同名函数
 * 4. 真正的 trampoline 是 VM 运行时生成的闭包
 *
 * 从 trampoline toString 可以看到完整代码：
 * function _$$t(){
 *   var _$$t,_$jT,_$dt,_$i1,_$_z,_$_n;
 *   if(_$hh._$eq)  // 条件标志
 *     (_$jT=_$bQ._$aE(), _$$t=_$bQ._$aE(), _$jT[1]=_$e6[1], _$jT[3]=_$e6[3]);
 *   else {
 *     _$jT=[], _$$t=new _$lc(_$hh._$bi),
 *     _$jT[1]=_$e6[1].concat([arguments]),
 *     _$jT[3]=_$e6[3].concat([_$$t]),
 *     _$dt=_$hh._$dR;
 *     for(_$i1=2;_$i1<_$dt.length;_$i1++)
 *       _$$t[_$i1]=_$iQ(_$dt[_$i1],_$jT);
 *   }
 *   _$jT[0]=arguments, _$jT[2]=_$$t,
 *   _$$t[0]=this, _$$t[1]=arguments,
 *   _$hh._$ft.charCodeAt ? _$hh._$ft=_$kU(_$hh._$ft) : 0,
 *   _$cV(_$hh, 0, _$hh._$ft.length, _$jT),  // VM 执行
 *   _$_z=_$jT[4], _$_n=_$jT[5],
 *   _$hh._$eq ? (_$bQ._$eL(_$jT), _$bQ._$eL(_$$t)) : 0;
 *   if(_$_z===1) return _$_n;
 * }
 *
 * trampoline 是闭包，变量 _$hh, _$bQ, _$e6, _$cV 等是闭包变量
 * 不能从外部访问，也不能通过 patch 动态代码来修改
 *
 * 新方法：用 Function.prototype.toString 来获取 trampoline 代码
 * 然后用 new Function() 重建一个带导出的版本
 * 或者：直接 hook _$cV（VM 执行函数）
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
  console.log('=== Hook trampoline 闭包 v14 ===\n');

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

  // 执行
  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, code); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 获取 trampoline
  var xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  var trampName = null;
  for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { trampName = k; break; } }
  if (!trampName) { console.log('No trampoline'); process.exit(0); }
  
  var trampFn = xhr[trampName];
  var trampStr = trampFn.toString();
  console.log('Trampoline:', trampName);
  console.log('Code length:', trampStr.length);
  
  // 从 trampoline 代码中提取变量名
  var configMatch = trampStr.match(/if\((_[$a-zA-Z0-9]+)\.(_[$a-zA-Z0-9]+)\)/);
  var configObj = configMatch ? configMatch[1] : null;
  var configProp = configMatch ? configMatch[2] : null;
  
  var exitMatch = trampStr.match(/(_[$a-zA-Z0-9]+)=(_[$a-zA-Z0-9]+)\[4\],(_[$a-zA-Z0-9]+)=(_[$a-zA-Z0-9]+)\[5\]/);
  var exitCodeVar = exitMatch ? exitMatch[1] : null;
  var retValVar = exitMatch ? exitMatch[3] : null;
  var argsArr = exitMatch ? exitMatch[2] : null;
  
  console.log('Config obj:', configObj, 'condition:', configProp);
  console.log('Args array:', argsArr);
  console.log('Exit code var:', exitCodeVar);
  console.log('Return val var:', retValVar);
  
  // 关键：用 Proxy 包装 trampoline 函数
  // 当 trampoline 被调用时，在调用前后记录信息
  console.log('\n=== 用 Proxy 拦截 trampoline ===');
  
  // 替换 trampoline 为带 logging 的版本
  var origTramp = trampFn;
  xhr[trampName] = new Proxy(origTramp, {
    apply: function(target, thisArg, args) {
      console.log('Trampoline called with args:', args.length);
      console.log('  thisArg keys:', Object.keys(thisArg).filter(function(k) { return k.startsWith('_$'); }));
      
      // 调用原始 trampoline
      var result;
      try {
        result = target.apply(thisArg, args);
      } catch(e) {
        console.log('  Threw:', e.message);
        result = undefined;
      }
      
      console.log('  Result:', JSON.stringify(String(result).substring(0, 80)));
      console.log('  Result type:', typeof result);
      console.log('  Result length:', typeof result === 'string' ? result.length : -1);
      
      return result;
    }
  });
  
  // 调用
  var result = xhr[trampName]('{}');
  console.log('\nFinal result:', JSON.stringify(String(result).substring(0, 80)));
  
  // 方法 2：用 Function.prototype.toString 获取 trampoline 代码
  // 然后用 eval 重建一个带导出的版本
  console.log('\n\n=== 方法 2: 重建 trampoline ===');
  
  // 从 trampoline 代码中提取关键信息
  // 代码中有 _$cV(_$hh, 0, _$hh._$ft.length, _$jT)
  // _$cV 是 VM 执行函数
  // _$hh 是配置对象
  // _$hh._$ft 是 bytecode
  // _$jT 是 args 数组
  
  // 在 trampoline 执行后，_$jT[4] 是 exit code, _$jT[5] 是 return value
  // 如果 exit code !== 1，不返回
  
  // 我们需要知道 exit code 是什么
  // 方法：用 with 语句或 eval 来访问闭包变量
  
  // 但闭包变量不能从外部访问
  // 另一种方法：在 trampoline 的 else 分支中，
  // _$jT[1]=_$e6[1].concat([arguments])
  // _$e6[1] 是某个数组，_$e6[3] 也是
  // 这些是 VM 的上下文
  
  // 关键发现：trampoline 的 if(_$hh._$eq) 分支
  // 如果 _$hh._$eq 为 true，走 if 分支（使用缓存）
  // 如果 _$hh._$eq 为 false，走 else 分支（创建新 VM 上下文）
  
  // 检查 _$hh._$eq 的值
  // _$hh 是闭包变量，不能直接访问
  // 但我们可以通过分析 trampoline 的行为来推断
  
  // 如果 trampoline 返回 undefined（不是 ""），说明 exit code !== 1
  // 如果返回 ""，说明 exit code === 1 但 return value === ""
  
  console.log('\n=== 分析 exit code ===');
  console.log('Trampoline returned:', typeof result, JSON.stringify(result));
  if (result === undefined) {
    console.log('exit code !== 1 (function returned undefined)');
    console.log('VM exited abnormally');
  } else if (result === '') {
    console.log('exit code === 1, return value === ""');
    console.log('VM exited normally but returned empty string');
    console.log('This means VM logic set return value to ""');
  } else if (typeof result === 'string' && result.length > 0) {
    console.log('exit code === 1, return value has content');
    console.log('QUERY:', result);
  }
  
  // 方法 3：包装 XHR.send 来检查 RS 是否在 send 时追加 query
  console.log('\n\n=== 方法 3: 检查 RS send hook ===');
  // RS 通常 hook XMLHttpRequest.prototype.send
  // 在 send 内部调用 trampoline 生成 query，然后追加到 URL
  // 但从 v9 发现 send 是 [native code]（我们的 stub）
  // RS 可能没有 hook send，而是在 open 时设置 trampoline
  // 然后 RS 期望用户代码在 send 之前调用 trampoline
  
  // 或者 RS 用 defineProperty 替换了 send
  // 检查 XHR 实例上的 send
  var sendStr = xhr.send ? xhr.send.toString() : 'no send';
  console.log('xhr.send:', sendStr.substring(0, 200));
  
  // 检查 open 是否被 hook
  var openStr = typeof xhr.open === 'function' ? xhr.open.toString() : 'no open';
  console.log('xhr.open:', openStr.substring(0, 200));
  
  // 检查 XMLHttpRequest.prototype 上是否有 RS hook
  var protoKeys = Object.getOwnPropertyNames(RSXHR2.prototype);
  console.log('\nPrototype keys:', protoKeys);
  protoKeys.forEach(function(key) {
    var desc = Object.getOwnPropertyDescriptor(RSXHR2.prototype, key);
    if (desc && desc.value && typeof desc.value === 'function') {
      var str = desc.value.toString();
      if (str !== 'function () {}' && str.indexOf('native code') < 0) {
        console.log('  ' + key + ':', str.substring(0, 150));
      }
    }
  });

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
