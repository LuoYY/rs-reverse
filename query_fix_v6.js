/**
 * query_fix_v6.js — 修复剩余 3 个异常
 *
 * charAt 已修复！现在剩 3 个：
 * 1. Cannot read properties of undefined (reading 'length')
 *    → VM dispatcher 中某个值是 undefined
 * 2. Cannot read properties of undefined (reading 'call')
 *    → VM dispatcher 中方法调用失败
 * 3. _$k7[_$lu[27]] is not a function
 *    → 某个对象的属性应该是函数但不是
 *
 * 异常 3 分析：
 * _$k7[_$lu[27]](0,_$f6[2])
 * → _$k7 是某个对象
 * → _$lu[27] 是方法名（可能是 'substr'/'slice'/'split'）
 * → _$k7 应该是字符串或数组，但缺少这个方法
 *
 * 可能 _$k7 是 document.cookie 或 navigator.userAgent 的某个部分
 * 或者 _$k7 是某个 DOM 属性返回值
 *
 * 方法：
 * 1. 用 Proxy 追踪哪个对象缺少方法
 * 2. 在出错位置导出变量
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
        var parsed;
        try { parsed = new URL(this._href, base); }
        catch(e) { parsed = { href: this._href, protocol: '', host: '', hostname: '', port: '', pathname: this._href, search: '', hash: '', origin: base }; }
        this._url = parsed;
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
  console.log('=== 修复剩余 3 个异常 v6 ===\n');

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

  // 构建增强沙箱
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  var origCreateElement = env2.sandbox.document.createElement;
  env2.sandbox.document.createElement = function(tag) {
    if (String(tag).toLowerCase() === 'a') return makeAnchorEl();
    return origCreateElement.call(this, tag);
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
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, patched); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  vm.runInContext('window.__ce = []', env2.proxied);

  // 触发
  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  if (tramp) {
    try { tramp.call(xhr, '{}'); } catch(e) {}
  }

  var catches = vm.runInContext('window.__ce || []', env2.proxied);
  console.log('Catches:', catches.length);

  // 分析每个异常
  var seen = new Set();
  catches.forEach(function(c, i) {
    if (seen.has(c.msg)) return;
    seen.add(c.msg);
    console.log('\n[Catch]', c.msg.substring(0, 100));
    if (c.stack) {
      var frames = [...c.stack.matchAll(/at\s+(\S+)\s+\(dyn\.js:(\d+):(\d+)\)/g)];
      frames.slice(0, 5).forEach(function(f) {
        console.log('  ', f[1], 'at line', f[2], 'col', f[3]);
      });
      
      // 在 patched 代码中定位
      var firstFrame = frames[0];
      if (firstFrame) {
        var lineNum = parseInt(firstFrame[2]);
        var colNum = parseInt(firstFrame[3]);
        var pLineStarts = [0];
        for (var pi = 0; pi < patched.length; pi++) {
          if (patched[pi] === '\n') pLineStarts.push(pi + 1);
        }
        if (lineNum <= pLineStarts.length) {
          var lStart = pLineStarts[lineNum - 1];
          var lEnd = lineNum < pLineStarts.length ? pLineStarts[lineNum] - 1 : patched.length;
          var lContent = patched.substring(lStart, lEnd);
          var col0 = colNum - 1;
          if (col0 < lContent.length) {
            // 找到包含此位置的函数
            var before = lContent.substring(0, col0);
            var lastFunc = before.lastIndexOf('function ');
            var inFunc = '?';
            if (lastFunc >= 0) {
              var fnM = lContent.substring(lastFunc, lastFunc + 80).match(/function\s+([_$$a-zA-Z0-9]+)/);
              if (fnM) inFunc = fnM[1];
            }
            console.log('  In function:', inFunc);
            console.log('  Code:', lContent.substring(Math.max(0, col0 - 80), Math.min(lContent.length, col0 + 120)));
          }
        }
      }
    }
  });

  // 特别分析异常 3: _$k7[_$lu[27]] is not a function
  // 需要知道 _$lu[27] 的值（方法名）
  // 在运行时导出
  console.log('\n\n=== 深入分析异常 3: not-a-function ===');
  var notFnError = catches.find(function(c) { return c.msg.indexOf('is not a function') >= 0; });
  if (notFnError) {
    // 从 error message 提取变量名
    // 格式: _$k7[_$lu[27]] is not a function
    var varMatch = notFnError.msg.match(/(\\S+)\\[(\\S+)\\[(\\d+)\\]\\]/);
    if (!varMatch) {
      // 尝试直接匹配
      varMatch = notFnError.msg.match(/(_\\$\\S+)\\[(_\\$\\S+)\\[(\\d+)\\]\\]/);
    }
    console.log('Error msg:', notFnError.msg);
    
    // 从 stack 提取函数名
    var firstFrame = notFnError.stack.match(/at\s+(\S+)\s+\(dyn\.js:/);
    var errFunc = firstFrame ? firstFrame[1] : '?';
    console.log('Error function:', errFunc);
    
    // 在 patched 代码中找到这个函数
    var funcPattern = new RegExp('function\\s+' + errFunc.replace(/\\$/g, '\\\\$') + '\\s*\\(', 'g');
    // 在 patched 代码的所有行中搜索
    var funcMatch = funcPattern.exec(patched);
    if (funcMatch) {
      var funcStart = funcMatch.index;
      var funcBrace = patched.indexOf('{', funcStart);
      var funcDepth = 0;
      var funcEnd = funcBrace;
      for (var fi = funcBrace; fi < patched.length; fi++) {
        if (patched[fi] === '{') funcDepth++;
        else if (patched[fi] === '}') { funcDepth--; if (funcDepth === 0) { funcEnd = fi; break; } }
      }
      var funcBody = patched.substring(funcStart, funcEnd + 1);
      console.log('\nFunction body:');
      console.log(funcBody.substring(0, 500));
      if (funcBody.length > 500) console.log('... (' + (funcBody.length - 500) + ' more)');
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
