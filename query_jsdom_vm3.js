/**
 * query_jsdom_vm3.js - 修复 jsdom 中 send 调用的 undefined.random 错误
 *
 * 错误：Cannot read properties of undefined (reading 'random')
 * 在 send hook 执行时，某个对象是 undefined
 * 
 * 从堆栈：
 * _$ca -> _$_p (send hook) -> _$$H -> _$lT -> _$ca -> _$_p
 * 递归调用链：send -> 内部函数 -> send -> ...
 * 
 * 这说明 RS 的 send hook 内部调用了某个函数
 * 这个函数又触发了 send
 * 形成了递归
 * 
 * 但之前在沙箱中（vm.runInContext）不会递归
 * 因为沙箱的 send 是空函数（只设置 readyState）
 * 
 * jsdom 的 XMLHttpRequest 有真实的实现
 * RS 的 send hook 内部调用原始 send
 * 但 jsdom 的 send 可能触发了某些事件
 * 这些事件又触发了 RS 的 send hook
 * 
 * 修复：替换 jsdom 的 XMLHttpRequest 为简单的 stub
 * 但保留 prototype.send/open 的 writable:true
 * 让 RS 能替换它们
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const fs = require('fs'), path = require('path');
const ROOT = __dirname;
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function makeAnchorEl() {
  var el = { tagName:'A',nodeName:'A',nodeType:1,style:new Proxy({},{get:()=>'',set:()=>true}),children:[],childNodes:[],
    setAttribute:function(n,v){if(n==='href')this.href=String(v);},getAttribute:function(n){return n==='href'?this._href||'':null;},
    removeAttribute(){},appendChild(c){return c;},removeChild(c){return c;},addEventListener(){},removeEventListener(){},_href:'',_url:null};
  Object.defineProperty(el,'href',{get:function(){return this._href;},set:function(v){this._href=String(v);try{var b=TARGET;try{this._url=new URL(this._href,b);}catch(e){this._url={href:this._href,protocol:'',host:'',hostname:'',port:'',pathname:this._href,search:'',hash:'',origin:b};}}catch(e){}},configurable:true});
  ['protocol','host','hostname','port','pathname','search','hash','origin'].forEach(function(p){Object.defineProperty(el,p,{get:function(){return this._url?(this._url[p]||''):'';},set:function(){},configurable:true});});
  el.innerHTML='';el.innerText='';el.textContent='';el.className='';el.id='';el.clientWidth=0;el.clientHeight=0;
  el.getBoundingClientRect=function(){return{top:0,left:0,right:0,bottom:0,width:0,height:0};};
  el.getElementsByTagName=function(){return[];};el.querySelector=function(){return null;};el.querySelectorAll=function(){return[];};
  el.cloneNode=function(){return makeAnchorEl();};el.remove=function(){};el.parentNode=null;el.parentElement=null;el.firstChild=null;el.lastChild=null;el.nextSibling=null;
  return el;
}

(async () => {
  console.log('=== jsdom + 简单 XHR stub ===\n');

  const { httpGet } = require('./proxy_http');
  var ch = await httpGet(TARGET, { userAgent: UA });
  var nsd = +(ch.body.match(/nsd=(\d+)/)||[])[1];
  var cd = (ch.body.match(/cd="([^"]+)"/)||[])[1];
  var sc = [].concat(ch.headers['set-cookie'] || []);
  var oCookie = sc.map(c => c.split(';')[0]).find(c => c.indexOf('O=') >= 0) || sc[0].split(';')[0];
  
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var client = new PmosXjClientProxy();
  await client.init();
  var cp3 = client._extractCp3(nsd, cd);
  var gen = await client._genCookie({nsd,cd,from:TARGET,hasDebug:false,keynameNum:909,cp3Override:cp3}, cp3);
  var seedCookie = oCookie + '; ' + gen.name + '=' + gen.cookie;

  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const dom = new (require('jsdom').JSDOM)('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, userAgent: UA, runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  
  window.$_ts = { nsd, cd };
  var cj = seedCookie;
  var cookies = [];
  Object.defineProperty(window.document, 'cookie', {
    get() { return cj; }, set(v) { cookies.push(v); cj = cj ? cj + '; ' + v : v; }, configurable: true,
  });
  
  var origCreateElement = window.document.createElement.bind(window.document);
  window.document.createElement = function(tag) {
    if (String(tag).toLowerCase() === 'a') return makeAnchorEl();
    return origCreateElement(tag);
  };
  
  // ★ 关键：替换 XMLHttpRequest 为简单 stub（不用 jsdom 的真实实现）
  // 但保留 prototype.send/open 的 writable:true
  function SimpleXHR() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.responseURL = '';
    this.response = '';
    this._url = '';
    this._method = '';
    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this.timeout = 0;
    this.withCredentials = false;
    this.responseType = '';
    this.statusText = '';
    this.upload = { addEventListener: function(){}, removeEventListener: function(){} };
  }
  SimpleXHR.prototype.open = function(method, url) {
    this._method = String(method);
    this._url = String(url);
    this.readyState = 1;
  };
  SimpleXHR.prototype.send = function(body) {
    this.readyState = 4;
    this.status = 200;
    this.responseText = '{}';
    this.response = '{}';
    this.responseURL = this._url;
  };
  SimpleXHR.prototype.setRequestHeader = function() {};
  SimpleXHR.prototype.abort = function() {};
  SimpleXHR.prototype.getAllResponseHeaders = function() { return ''; };
  SimpleXHR.prototype.getResponseHeader = function() { return null; };
  SimpleXHR.prototype.overrideMimeType = function() {};
  SimpleXHR.prototype.addEventListener = function() {};
  SimpleXHR.prototype.removeEventListener = function() {};
  SimpleXHR.prototype.dispatchEvent = function() { return true; };
  
  // 替换 jsdom 的 XMLHttpRequest
  window.XMLHttpRequest = SimpleXHR;
  
  // 执行 RS
  var origEval = window.eval;
  var dynPatched = false;
  window.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !dynPatched) {
      dynPatched = true;
      // Patch catch blocks
      var patched = code;
      var pattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
      var m; var off = 0;
      while ((m = pattern.exec(code)) !== null) {
        var e = m[1];
        var pos = m.index + m[0].length + off;
        var ins = 'if(!window.__ce)window.__ce=[];try{window.__ce.push(String(' + e + '&&' + e + '.message||' + e + ').substring(0,120));}catch(_$ign){}';
        patched = patched.substring(0, pos) + ins + patched.substring(pos);
        off += ins.length;
      }
      return origEval.call(window, patched);
    }
    return origEval.call(window, code);
  };
  
  console.log('[1] 执行 RS...');
  try { origEval.call(window, outerJsCode); } catch(e) { console.log('  Error:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 3000));
  
  var sendName = window.XMLHttpRequest.prototype.send.name;
  console.log('  send.name:', sendName);
  console.log('  RS hooked:', sendName.indexOf('_$') === 0 ? 'YES ★' : 'NO');
  
  if (sendName.indexOf('_$') === 0) {
    window.__ce = [];
    
    // 创建 XHR 并 open
    var xhr = new window.XMLHttpRequest();
    window.XMLHttpRequest.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    
    // 设置 boolean
    Object.getOwnPropertyNames(xhr).forEach(function(k) {
      if (k.indexOf('_$') === 0 && typeof xhr[k] === 'boolean') xhr[k] = true;
    });
    
    // 找到 trampoline
    var tramp = null;
    Object.getOwnPropertyNames(xhr).forEach(function(k) {
      if (k.indexOf('_$') === 0 && typeof xhr[k] === 'function') tramp = xhr[k];
    });
    
    // 调用 trampoline
    console.log('\n[2] 调用 trampoline...');
    var result = '';
    try { result = tramp.call(xhr, '{}') || ''; } catch(e) { console.log('  Error:', e.message.substring(0, 80)); }
    console.log('  Result length:', result.length);
    if (result.length > 10) console.log('  Result:', result.substring(0, 80));
    
    // 检查 catch
    var catches = window.__ce || [];
    console.log('  Catches:', catches.length);
    var seen = new Set();
    catches.forEach(function(c) { if (!seen.has(c)) { seen.add(c); console.log('    -', c); } });
    
    // 调用 send
    console.log('\n[3] 调用 send...');
    window.__ce = [];
    
    var xhr2 = new window.XMLHttpRequest();
    xhr2.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    
    // 设置 boolean
    Object.getOwnPropertyNames(xhr2).forEach(function(k) {
      if (k.indexOf('_$') === 0 && typeof xhr2[k] === 'boolean') xhr2[k] = true;
    });
    
    try {
      xhr2.send('{}');
      console.log('  Send OK');
      console.log('  responseURL:', xhr2.responseURL ? xhr2.responseURL.substring(0, 100) : 'none');
      console.log('  _url:', xhr2._url ? xhr2._url.substring(0, 100) : 'none');
      
      if (xhr2.responseURL && xhr2.responseURL.indexOf('r20SZOQm=') >= 0) {
        var qMatch = xhr2.responseURL.match(/r20SZOQm=([^&]+)/);
        console.log('\n★★★ Query:', qMatch[1]);
      }
    } catch(e) {
      console.log('  Send error:', e.message.substring(0, 80));
    }
    
    // catch after send
    var catches2 = window.__ce || [];
    console.log('\n  Catches after send:', catches2.length);
    var seen2 = new Set();
    catches2.forEach(function(c) { if (!seen2.has(c)) { seen2.add(c); console.log('    -', c); } });
    
    // cookie
    console.log('\n[4] Cookies:', cookies.length);
    cookies.slice(-3).forEach(function(c, i) { console.log('  [' + i + ']', c.substring(0, 80)); });
  }
  
  window.close();
  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
