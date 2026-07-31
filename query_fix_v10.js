/**
 * query_fix_v10.js — 分析 trampoline 闭包 + 检查 _$k8._$_1 条件
 *
 * 从 v9 的关键发现：
 * 1. Trampoline (_$bp) 返回 "" 不是因为异常，而是正常逻辑
 * 2. Trampoline 闭包代码：function _$d9(){var _$d9,...;if(_$k8._$_1)(...) else {...}}
 * 3. RS 只有 2 个属性在 XHR 上：_$bp (trampoline fn), _$dV (boolean false)
 * 4. open/send 是 [native code]（我们的 stub），RS 没有替换它们
 * 5. RS 没有在 prototype 上设置 hook
 *
 * 关键：trampoline 的代码 if(_$k8._$_1) ...
 * _$k8._$_1 是一个条件标志
 * 如果 _$k8._$_1 为 false/undefined，trampoline 走 else 分支
 * else 分支可能设置 args[5]="" 并返回
 *
 * _$k8 可能是 RS 的全局配置对象
 * _$_1 可能是 "是否启用 query 生成" 的标志
 *
 * 方法：
 * 1. 在沙箱中提取 _$k8 的值
 * 2. 检查 _$k8._$_1
 * 3. 如果为 false，尝试设置为 true
 * 4. 或者分析 else 分支的逻辑
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
  console.log('=== 分析 trampoline 闭包和 _$k8 条件 v10 ===\n');

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

  // 在动态代码末尾插入全局变量导出
  // 导出 _$k8 和其他 RS 内部变量
  // 但这些变量是闭包内部的，不能从外部访问
  // 方法：在动态代码中搜索 _$k8 的定义，在定义后插入 window.__k8=_$k8

  // 搜索 _$k8 赋值
  console.log('\n=== 搜索 _$k8 定义 ===');
  var k8Pattern = /_\$k8\s*=/g;
  var k8Match;
  var k8Positions = [];
  while ((k8Match = k8Pattern.exec(dynCode)) !== null) {
    k8Positions.push(k8Match.index);
    var ctx = dynCode.substring(k8Match.index, Math.min(dynCode.length, k8Match.index + 200));
    console.log('  pos', k8Match.index, ':', ctx.substring(0, 150));
  }

  // 搜索 _$_1 属性赋值
  console.log('\n=== 搜索 _$_1 定义 ===');
  var i1Pattern = /_\$_1\s*=/g;
  var i1Match;
  while ((i1Match = i1Pattern.exec(dynCode)) !== null) {
    var ctx = dynCode.substring(i1Match.index, Math.min(dynCode.length, i1Match.index + 200));
    console.log('  pos', i1Match.index, ':', ctx.substring(0, 150));
  }

  // 搜索 trampoline 创建位置
  // trampoline 被赋值到 XHR 实例上的 _$bp 属性
  // 搜索 ._$bp=
  console.log('\n=== 搜索 trampoline 赋值 ===');
  var bpPattern = /\._\$bp\s*=/g;
  var bpMatch;
  while ((bpMatch = bpPattern.exec(dynCode)) !== null) {
    var ctx = dynCode.substring(bpMatch.index, Math.min(dynCode.length, bpMatch.index + 300));
    console.log('  pos', bpMatch.index, ':', ctx.substring(0, 250));
  }

  // 在 _$k8 定义后插入导出
  // _$k8 可能是某个大对象
  // 让我们尝试在动态代码中找到所有全局变量定义
  // 方法：在动态代码执行后，从 window 上提取所有 _$ 开头的属性
  // 但 RS 代码是在闭包中执行的，变量不在 window 上
  
  // 另一种方法：修改动态代码，在关键位置插入 window.__xxx = xxx
  // 在 _$k8= 后插入 window.__k8=_$k8

  // 找到第一个 _$k8= 的位置
  if (k8Positions.length > 0) {
    var firstK8 = k8Positions[0];
    // 找到赋值表达式的结束位置（分号）
    var semicolonPos = dynCode.indexOf(';', firstK8);
    if (semicolonPos > 0 && semicolonPos < firstK8 + 500) {
      var insertPos = semicolonPos + 1;
      var exportCode = 'try{window.__k8=_$k8;}catch(_$e){}';
      var patched = dynCode.substring(0, insertPos) + exportCode + dynCode.substring(insertPos);
      console.log('\nInserted _$k8 export at pos', insertPos);
      
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

      const origEval2 = env2.sandbox.eval;
      let done = false;
      env2.sandbox.eval = function(code) {
        if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, patched); }
        return origEval2.call(this, code);
      };
      try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
      await new Promise(r => setTimeout(r, 2000));

      // 提取 _$k8
      var k8Type = vm.runInContext('typeof window.__k8', env2.proxied);
      console.log('\n_$k8 type:', k8Type);
      
      if (k8Type !== 'undefined') {
        var k8Keys = vm.runInContext('window.__k8 ? Object.keys(window.__k8).join(", ") : "null"', env2.proxied);
        console.log('_$k8 keys:', k8Keys);
        
        // 检查 _$_1
        var i1Val = vm.runInContext('window.__k8 ? window.__k8._$_1 : "no __k8"', env2.proxied);
        console.log('_$k8._$_1:', i1Val);
        
        // 导出完整的 _$k8
        var k8Str = vm.runInContext('JSON.stringify(window.__k8, null, 2)', env2.proxied);
        if (k8Str && k8Str.length < 2000) {
          console.log('\n_$k8:', k8Str);
        } else {
          console.log('\n_$k8 (truncated):', k8Str ? k8Str.substring(0, 500) : 'null');
        }
        
        // 检查其他关键属性
        var k8Props = vm.runInContext('window.__k8 ? Object.getOwnPropertyNames(window.__k8).slice(0,50) : []', env2.proxied);
        console.log('\n_$k8 all properties:', k8Props);
        
        // 检查每个属性的值类型
        k8Props.forEach(function(p) {
          var val = vm.runInContext('window.__k8["' + p + '"]', env2.proxied);
          var valType = typeof val;
          if (valType === 'function') {
            console.log('  _$k8.' + p + ': function (' + String(val).substring(0, 80) + '...)');
          } else if (valType === 'object' && val !== null) {
            if (val instanceof Array) {
              console.log('  _$k8.' + p + ': array[' + val.length + ']');
            } else {
              console.log('  _$k8.' + p + ': object');
            }
          } else {
            console.log('  _$k8.' + p + ': ' + valType + ' = ' + String(val).substring(0, 50));
          }
        });
      }
      
      // 触发 trampoline 并检查
      console.log('\n=== 触发 trampoline ===');
      var xhr = new RSXHR2();
      RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
      var tramp = null;
      for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }
      if (tramp) {
        var result = '';
        try { result = tramp.call(xhr, '{}') || ''; } catch(e) { console.log('Threw:', e.message); }
        console.log('Result:', JSON.stringify(result.substring(0, 80)));
        console.log('Length:', result.length);
      }
      
      // 如果 _$k8._$_1 是 false，尝试设为 true
      if (k8Type !== 'undefined') {
        var i1Val2 = vm.runInContext('window.__k8._$_1', env2.proxied);
        console.log('\n_$k8._$_1 before:', i1Val2);
        if (!i1Val2) {
          vm.runInContext('window.__k8._$_1 = true', env2.proxied);
          console.log('Set _$k8._$_1 = true');
          
          // 重新触发
          var xhr2 = new RSXHR2();
          RSXHR2.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
          for (var k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true; }
          var tramp2 = null;
          for (var k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; } }
          if (tramp2) {
            var result2 = '';
            try { result2 = tramp2.call(xhr2, '{}') || ''; } catch(e) { console.log('Threw:', e.message); }
            console.log('Result after _$_1=true:', JSON.stringify(result2.substring(0, 80)));
            console.log('Length:', result2.length);
            if (result2.length > 10) {
              console.log('\n*** QUERY CAPTURED! ***');
              console.log('Query:', result2);
            }
          }
        }
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
