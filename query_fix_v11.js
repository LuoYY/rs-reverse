/**
 * query_fix_v11.js — 提取 trampoline 闭包内部变量
 *
 * 从 v10 发现：_$k8 在多个位置赋值，但都是局部变量
 * 第一个赋值 _$k8=0 是在某个 case 分支中
 * window.__k8 导出失败（_$k8 是函数内部的局部变量）
 *
 * 新方法：
 * 1. 在 trampoline 函数内部插入 logging
 * 2. trampoline 的闭包变量 _$k8 是 XHR 实例的某个属性
 * 3. 从 v9 的 trampoline toString 可以看到完整代码
 *
 * trampoline 代码分析：
 * function _$d9(){var _$d9,_$iH,_$_j,_$dX,_$e3,_$l3;
 *   if(_$k8._$_1)
 *     (_$iH=_$lP._$dD(), _$d9=_$lP._$dD(), _$iH[1]=_$cc[1], _$iH[3]=_$cc[3]);
 *   else{
 *     _$iH=[], _$d9=new _$j$(_$k8._$$P),
 *     _$iH[1]=_$cc[1].concat([arguments]),
 *     _$iH[3]=_$cc[3].concat([_$d9]),
 *     _$_j=_$k8._$dF;
 *     for(_$dX=2;_$dX<_$_j.length;_$dX++)
 *       _$d9[_$dX]=_$_j[_$dX];
 *     ...
 *   }
 *
 * _$k8 是闭包变量，指向 RS 的配置对象
 * _$_1 是配置标志
 * _$$P 是某个值
 * _$dF 是某个数组
 *
 * 方法：在 trampoline 函数体开头插入 window.__k8=_$k8
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
  console.log('=== 提取 trampoline 闭包变量 v11 ===\n');

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

  // trampoline 函数名是 _$d9（从 v9 的 toString 得知）
  // 但函数名每次会话不同
  // 方法：先执行获取 trampoline 的 toString，从中提取函数名
  
  // Step 1: 执行获取 trampoline
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
    if (typeof code === 'string' && code.length > 50000 && !done1) { done1 = true; return origEval2.call(this, code); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 获取 trampoline
  var xhr1 = new RSXHR2();
  RSXHR2.prototype.open.call(xhr1, 'POST', '/test', true);
  var trampName = null;
  for (var k in xhr1) { if (k.startsWith('_$') && typeof xhr1[k] === 'function') { trampName = k; break; } }
  if (!trampName) { console.log('No trampoline found'); process.exit(0); }
  
  var trampStr = xhr1[trampName].toString();
  console.log('Trampoline name:', trampName);
  console.log('Trampoline code:\n', trampStr);
  
  // 从 trampoline 代码中提取函数名
  var trampFuncMatch = trampStr.match(/function\s+([_$$a-zA-Z0-9]+)/);
  var trampFuncName = trampFuncMatch ? trampFuncMatch[1] : null;
  console.log('\nTrampoline function name:', trampFuncName);
  
  // 从 trampoline 代码中提取闭包变量名
  // 代码中有 _$k8._$_1, _$lP._$dD(), _$cc[1], _$j$, _$k8._$$P, _$k8._$dF
  // 这些变量名每次会话不同
  var k8Match = trampStr.match(/if\((\S+)\._\S+\)/);
  var k8VarName = k8Match ? k8Match[1] : null;
  console.log('Config variable name:', k8VarName);
  
  // 提取所有变量引用
  var varMatches = [...trampStr.matchAll(/([_$$a-zA-Z0-9]+)\.([_$$a-zA-Z0-9]+)/g)];
  var uniqueVars = {};
  varMatches.forEach(function(m) {
    var obj = m[1], prop = m[2];
    if (!uniqueVars[obj]) uniqueVars[obj] = [];
    if (uniqueVars[obj].indexOf(prop) < 0) uniqueVars[obj].push(prop);
  });
  console.log('\nVariable references in trampoline:');
  Object.keys(uniqueVars).forEach(function(v) {
    console.log('  ' + v + ': ' + uniqueVars[v].join(', '));
  });

  // Step 2: 在动态代码中搜索 trampoline 函数定义
  // 搜索 function _$d9( 或实际函数名
  if (trampFuncName) {
    var escapedName = trampFuncName.replace(/\$/g, '\\$');
    var funcRegex = new RegExp('function\\s+' + escapedName + '\\s*\\([^)]*\\)\\s*\\{', 'g');
    var funcMatch = funcRegex.exec(dynCode);
    if (funcMatch) {
      console.log('\nFound trampoline definition at pos', funcMatch.index);
      var funcBodyStart = funcMatch.index + funcMatch[0].length;
      
      // 在函数体开头插入变量导出
      // 导出 _$k8（配置变量）和 _$lP（另一个关键对象）
      var exportCode = 'try{window.__tramp_vars={';
      if (k8VarName) exportCode += 'config:' + k8VarName + ',';
      // 导出所有引用的对象
      Object.keys(uniqueVars).forEach(function(v, i) {
        if (v !== 'window' && v !== 'this' && v !== 'arguments') {
          exportCode += '"' + v + '":typeof ' + v + '!=="undefined"?' + v + ':null,';
        }
      });
      exportCode += '};}catch(_$e){try{window.__tramp_err=_$e.message;}catch(_$ign){}}';
      
      var patched = dynCode.substring(0, funcBodyStart) + exportCode + dynCode.substring(funcBodyStart);
      console.log('Inserted export code at pos', funcBodyStart);
      
      // Step 3: 执行 patched 代码
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
        if (typeof code === 'string' && code.length > 50000 && !done2) { done2 = true; return origEval3.call(this, code); }
        return origEval3.call(this, code);
      };
      try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env3.proxied, { timeout: 30000 }); } catch(e) {}
      await new Promise(r => setTimeout(r, 2000));

      // 触发 trampoline
      var xhr2 = new RSXHR3();
      RSXHR3.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      for (var k2 in xhr2) { if (k2.startsWith('_$') && typeof xhr2[k2] === 'boolean') xhr2[k2] = true; }
      var tramp2 = null;
      for (var k2 in xhr2) { if (k2.startsWith('_$') && typeof xhr2[k2] === 'function') { tramp2 = xhr2[k2]; break; } }
      if (tramp2) {
        var result = '';
        try { result = tramp2.call(xhr2, '{}') || ''; } catch(e) { console.log('Threw:', e.message); }
        console.log('\nResult:', JSON.stringify(result.substring(0, 80)));
        console.log('Length:', result.length);
      }
      
      // 提取导出的变量
      var trampVarsType = vm.runInContext('typeof window.__tramp_vars', env3.proxied);
      console.log('\n__tramp_vars type:', trampVarsType);
      
      if (trampVarsType !== 'undefined') {
        var trampVarsStr = vm.runInContext('JSON.stringify(window.__tramp_vars, function(key,val){if(typeof val==="function")return"[fn]";if(typeof val==="object"&&val!==null&&val instanceof Array)return"[array:"+val.length+"]";return val;}, 2)', env3.proxied);
        console.log('\nTrampoline closure variables:');
        console.log(trampVarsStr ? trampVarsStr.substring(0, 2000) : 'null');
        
        // 检查 config 变量的属性
        var configType = vm.runInContext('typeof window.__tramp_vars.config', env3.proxied);
        console.log('\nConfig type:', configType);
        if (configType === 'object' && configType !== null) {
          var configKeys = vm.runInContext('window.__tramp_vars.config ? Object.keys(window.__tramp_vars.config).join(", ") : "null"', env3.proxied);
          console.log('Config keys:', configKeys);
          
          // 检查 _$_1 属性
          var configProps = Object.keys(uniqueVars).find(function(v) { return v === k8VarName; });
          if (configProps) {
            var i1Key = uniqueVars[k8VarName][0]; // 第一个属性
            var i1Val = vm.runInContext('window.__tramp_vars.config ? window.__tramp_vars.config["' + i1Key + '"] : "no config"', env3.proxied);
            console.log('Config.' + i1Key + ':', i1Val, '(' + typeof i1Val + ')');
          }
        }
      }
      
      // 检查错误
      var trampErr = vm.runInContext('window.__tramp_err || null', env3.proxied);
      if (trampErr) console.log('\nTramp error:', trampErr);
    } else {
      console.log('Trampoline function not found in dynamic code');
      console.log('This means the trampoline is VM-generated (not in the JS text)');
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
