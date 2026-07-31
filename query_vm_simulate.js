/**
 * query_vm_simulate.js — 完全模拟 VM 子程序 109 执行
 *
 * 核心思路：
 * 不再试图提取密钥或理解加密算法
 * 而是在沙箱中让 RS VM 完整执行 query 生成
 * 
 * 之前的障碍：
 * 1. charAt 异常 → 已修复（createElement('a') URL 解析）
 * 2. VM 返回空字符串 → catch 块异常导致
 * 3. 有时异常消失但仍返回空 → VM 内部条件不满足
 *
 * 新方案：
 * 1. 用管线 cookie（100% 有效）作为 seedCookie
 * 2. 在沙箱中执行 RS 动态代码
 * 3. RS 检测到有效 cookie → 设置内部状态
 * 4. 触发 XHR POST → RS 生成 query
 * 5. 从 URL 修改中捕获 query
 *
 * 关键改进：
 * - 用管线 cookie（不是沙箱自己生成的有 bug 的 cookie）
 * - 让 RS 认为页面已经"验证通过"
 * - RS 应该启用 query 生成
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

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
  ['protocol','host','hostname','port','pathname','search','hash','origin','username','password'].forEach(function(p) {
    Object.defineProperty(el, p, { get: function() { return this._url ? (this._url[p] || '') : ''; }, set: function(){}, configurable: true }); });
  el.innerHTML=''; el.innerText=''; el.textContent=''; el.className=''; el.id=''; el.clientWidth=0; el.clientHeight=0; el.offsetWidth=0; el.offsetHeight=0;
  el.getBoundingClientRect=function(){return{top:0,left:0,right:0,bottom:0,width:0,height:0};}; el.getElementsByTagName=function(){return[];}; el.querySelector=function(){return null;}; el.querySelectorAll=function(){return[];};
  el.cloneNode=function(){return makeAnchorEl();}; el.remove=function(){}; el.parentNode=null; el.parentElement=null; el.firstChild=null; el.lastChild=null; el.nextSibling=null;
  return el;
}

(async () => {
  console.log('=== 完全模拟 VM 子程序 109 ===\n');

  // Step 1: 管线生成 cookie
  console.log('[1] 管线生成 cookie...');
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  
  var ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var nsd = +m[1], cd = m[2];
  var sc = [].concat(ch.headers['set-cookie'] || []);
  var oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
  
  var client = new PmosXjClientProxy();
  await client.init();
  var cp3 = client._extractCp3(nsd, cd);
  var ts = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  var gen = await client._genCookie(ts, cp3);
  var seedCookie = `${oCookie}; ${gen.name}=${gen.cookie}`;
  console.log('  Cookie ready, length:', seedCookie.length);

  // Step 2: 构建增强沙箱
  console.log('\n[2] 构建增强沙箱...');
  const env = buildEnv({ nsd, cd }, { seedCookie });
  
  // 增强 createElement
  env.sandbox.document.createElement = function(tag) {
    if (String(tag).toLowerCase() === 'a') return makeAnchorEl();
    return env.sandbox.document.createElement.call(this, tag);
  };
  env.sandbox.document.createElementNS = function(ns, tag) {
    if (String(tag).toLowerCase() === 'a') return makeAnchorEl();
    return env.sandbox.document.createElementNS.call(this, ns, tag);
  };
  
  // Cookie 锁定
  env.sandbox.document = new Proxy(env.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie') return true; t[p] = v; return true; },
  });
  
  // XHR — 捕获 URL 修改
  var capturedQuery = null;
  function RSXHR() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.responseURL = '';
    this._url = '';
    this._method = '';
  }
  RSXHR.prototype.open = function(method, url) {
    this._method = String(method);
    this._url = String(url);
    this.readyState = 1;
  };
  RSXHR.prototype.send = function(body) {
    // 检查 URL 是否被 RS 修改（追加了 query）
    if (this._url && this._url.indexOf('r20SZOQm=') >= 0) {
      var qMatch = this._url.match(/r20SZOQm=([^&]+)/);
      if (qMatch && !capturedQuery) {
        capturedQuery = qMatch[1];
        console.log('  ★★★ Query captured from URL:', capturedQuery.substring(0, 50) + '...');
      }
    }
    this.readyState = 4;
    this.status = 200;
    this.responseText = '{}';
    this.response = '{}';
    this.responseURL = this._url;
  };
  RSXHR.prototype.setRequestHeader = function() {};
  RSXHR.prototype.abort = function() {};
  RSXHR.prototype.overrideMimeType = function() {};
  RSXHR.prototype.getAllResponseHeaders = function() { return ''; };
  RSXHR.prototype.getResponseHeader = function() { return null; };
  RSXHR.prototype.addEventListener = function() {};
  RSXHR.prototype.removeEventListener = function() {};
  RSXHR.prototype.dispatchEvent = function() { return true; };
  
  env.sandbox.XMLHttpRequest = RSXHR;

  // Step 3: 执行 RS 动态代码
  console.log('\n[3] 执行 RS 动态代码...');
  let dynCode = null;
  const origEval = env.sandbox.eval;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !dynCode) {
      dynCode = code;
      // Patch catch blocks
      var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
      var patched = code;
      var match;
      var offset = 0;
      while ((match = catchPattern.exec(code)) !== null) {
        var errVar = match[1];
        var insertPos = match.index + match[0].length + offset;
        var insert = 'if(!window.__ce)window.__ce=[];try{window.__ce.push({msg:String(' + errVar + '&&' + errVar + '.message||' + errVar + ').substring(0,120)});}catch(_$ign){}';
        patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
        offset += insert.length;
      }
      return origEval.call(this, patched);
    }
    return origEval.call(this, code);
  };
  
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env.proxied, { timeout: 30000 }); } catch(e) {
    console.log('  Outer JS error:', e.message.substring(0, 80));
  }
  await new Promise(r => setTimeout(r, 2000));
  
  if (!dynCode) { console.log('FATAL: dynCode not captured'); process.exit(1); }
  console.log('  Dynamic code:', dynCode.length, 'bytes');

  // Step 4: 检查 RS hook
  console.log('\n[4] 检查 RS hook...');
  var sendSrc = vm.runInContext('Function.prototype.toString.call(XMLHttpRequest.prototype.send)', env.proxied);
  console.log('  send source:', sendSrc ? sendSrc.substring(0, 60) : 'none');
  
  var isRsHooked = sendSrc && sendSrc.indexOf('function _$') === 0;
  console.log('  RS hooked:', isRsHooked ? 'YES' : 'NO');
  
  if (!isRsHooked) {
    console.log('  RS 未 hook send，检查 open...');
    var openSrc = vm.runInContext('Function.prototype.toString.call(XMLHttpRequest.prototype.open)', env.proxied);
    console.log('  open source:', openSrc ? openSrc.substring(0, 60) : 'none');
    isRsHooked = openSrc && openSrc.indexOf('function _$') === 0;
  }

  // Step 5: 触发 XHR POST
  console.log('\n[5] 触发 XHR POST...');
  
  // 清空 catch log
  vm.runInContext('window.__ce = []', env.proxied);
  
  var result = vm.runInContext(`
    (function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send('{}');
        
        // 检查 URL 是否被修改
        var url = xhr._url || '';
        var qMatch = url.match(/r20SZOQm=([^&]+)/);
        
        // 检查实例上的 RS 属性
        var rsProps = {};
        var allProps = Object.getOwnPropertyNames(xhr);
        for (var i = 0; i < allProps.length; i++) {
          var k = allProps[i];
          if (k.indexOf('_$') === 0) {
            rsProps[k] = typeof xhr[k];
          }
        }
        
        return JSON.stringify({
          url: url.substring(0, 100),
          hasQuery: qMatch !== null,
          query: qMatch ? qMatch[1].substring(0, 60) : '',
          rsProps: rsProps,
        });
      } catch(e) { return JSON.stringify({error: e.message.substring(0, 100)}); }
    })()
  `, env.proxied);
  
  var parsed = JSON.parse(result);
  console.log('  Result:', parsed);
  
  // 检查 catch log
  var catches = vm.runInContext('window.__ce || []', env.proxied);
  console.log('  Catches:', catches.length);
  var seen = new Set();
  catches.forEach(function(c) {
    if (!seen.has(c.msg)) { seen.add(c.msg); console.log('    -', c.msg); }
  });

  // Step 6: 如果有 trampoline，尝试调用
  if (parsed.rsProps) {
    var trampName = null;
    var boolName = null;
    Object.keys(parsed.rsProps).forEach(function(k) {
      if (parsed.rsProps[k] === 'function') trampName = k;
      if (parsed.rsProps[k] === 'boolean') boolName = k;
    });
    
    if (trampName) {
      console.log('\n[6] 调用 trampoline:', trampName);
      if (boolName) console.log('  Boolean flag:', boolName);
      
      // 设置 boolean 为 true
      var trampResult = vm.runInContext(`
        (function(){
          try {
            var xhr = new XMLHttpRequest();
            XMLHttpRequest.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
            
            // 设置所有 boolean 为 true
            var allProps = Object.getOwnPropertyNames(xhr);
            for (var i = 0; i < allProps.length; i++) {
              var k = allProps[i];
              if (k.indexOf('_$') === 0 && typeof xhr[k] === 'boolean') xhr[k] = true;
            }
            
            // 找到 trampoline
            var tramp = null;
            for (var i = 0; i < allProps.length; i++) {
              var k = allProps[i];
              if (k.indexOf('_$') === 0 && typeof xhr[k] === 'function') { tramp = xhr[k]; break; }
            }
            
            if (!tramp) return JSON.stringify({error: 'no trampoline'});
            
            // 调用 trampoline
            var result = '';
            try { result = tramp.call(xhr, '{}') || ''; } catch(e) { return JSON.stringify({error: e.message.substring(0, 80)}); }
            
            return JSON.stringify({
              result: String(result).substring(0, 100),
              resultType: typeof result,
              resultLen: typeof result === 'string' ? result.length : -1,
            });
          } catch(e) { return JSON.stringify({error: e.message.substring(0, 80)}); }
        })()
      `, env.proxied);
      
      var trampParsed = JSON.parse(trampResult);
      console.log('  Trampoline result:', trampParsed);
      
      if (trampParsed.resultLen > 10) {
        console.log('\n★★★ Query 生成成功！ ★★★');
        console.log('  Query:', trampParsed.result);
        
        // 保存
        fs.writeFileSync(
          path.join(ROOT, 'output/capture-20080/query-sandbox-generated.json'),
          JSON.stringify({ query: trampParsed.result, nsd: nsd, cd: cd, timestamp: new Date().toISOString() }, null, 2)
        );
      } else {
        console.log('  Trampoline 返回空');
        
        // 检查 catch log
        var catches2 = vm.runInContext('window.__ce || []', env.proxied);
        console.log('  Catches after trampoline:', catches2.length);
        var seen2 = new Set();
        catches2.forEach(function(c) {
          if (!seen2.has(c.msg)) { seen2.add(c.msg); console.log('    -', c.msg); }
        });
      }
    }
  }

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
