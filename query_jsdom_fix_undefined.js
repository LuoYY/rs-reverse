/**
 * query_jsdom_fix_undefined.js - 定位并修复 undefined.random
 *
 * 错误：Cannot read properties of undefined (reading 'random')
 * 在 _$kZ 函数中，被 send hook (_$ad) 调用
 * 
 * 方案：
 * 1. 在 jsdom 中注入 Proxy 检测 undefined 属性访问
 * 2. 或者：在动态代码中 patch _$kZ 函数添加 logging
 * 3. 或者：补充 jsdom 缺少的浏览器属性
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

// 进程级 watchdog：总执行超时强制退出（防 interval 死循环/同步卡死）
const WATCHDOG_MS = parseInt(process.env.VM_TIMEOUT || '90000', 10);
const _t0 = Date.now();
const _watchdog = setInterval(() => {
  if (Date.now() - _t0 > WATCHDOG_MS) {
    console.error(`\n[WATCHDOG] 总执行超过 ${WATCHDOG_MS}ms，强制退出（疑似死循环）`);
    try { window && window.close && window.close(); } catch (e) {}
    process.exit(124);
  }
}, 2000);

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
  console.log('=== 定位 undefined.random ===\n');

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
  window.document.createElement = function(tag) { return String(tag).toLowerCase()==='a' ? makeAnchorEl() : origCreateElement(tag); };
  
  // 简单 XHR
  function SimpleXHR(){this.readyState=0;this.status=0;this.responseText='';this.responseURL='';this.response='';this._url='';this.onreadystatechange=null;this.onload=null;this.onerror=null;this.timeout=0;this.withCredentials=false;this.responseType='';this.statusText='';this.upload={addEventListener:function(){},removeEventListener:function(){}};}
  SimpleXHR.prototype.open=function(m,u){this._url=String(u);this.readyState=1;};
  SimpleXHR.prototype.send=function(b){this.readyState=4;this.status=200;this.responseText='{}';this.response='{}';this.responseURL=this._url;};
  SimpleXHR.prototype.setRequestHeader=function(){};SimpleXHR.prototype.abort=function(){};
  SimpleXHR.prototype.getAllResponseHeaders=function(){return '';};SimpleXHR.prototype.getResponseHeader=function(){return null;};
  SimpleXHR.prototype.overrideMimeType=function(){};SimpleXHR.prototype.addEventListener=function(){};SimpleXHR.prototype.removeEventListener=function(){};SimpleXHR.prototype.dispatchEvent=function(){return true;};
  window.XMLHttpRequest = SimpleXHR;
  
  // 关键：在动态代码中搜索 .random 的使用
  // 并在 .random 调用前添加 null 检查
  var origEval = window.eval;
  var dynPatched = false;
  window.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !dynPatched) {
      dynPatched = true;
      
      // 方法1：搜索 .random 的使用位置
      var randomPattern = /\.random/g;
      var m;
      var randomPositions = [];
      while ((m = randomPattern.exec(code)) !== null) {
        randomPositions.push(m.index);
      }
      console.log('[Patch] .random found at', randomPositions.length, 'positions');
      randomPositions.slice(0, 10).forEach(function(pos, i) {
        var ctx = code.substring(Math.max(0, pos - 40), pos + 20);
        console.log('  [' + i + '] pos', pos, ':', ctx);
      });
      
      // 方法2：搜索 Math.random 的使用
      var mathRandomPattern = /Math\.random/g;
      var mathRandomCount = 0;
      while ((m = mathRandomPattern.exec(code)) !== null) { mathRandomCount++; }
      console.log('[Patch] Math.random found', mathRandomCount, 'times');
      
      // 方法3：搜索 .random 前面的变量名
      // 模式：XXX.random
      var xxxRandomPattern = /([_$$a-zA-Z0-9]+)\.random/g;
      var xxxRandomVars = new Set();
      while ((m = xxxRandomPattern.exec(code)) !== null) {
        xxxRandomVars.add(m[1]);
      }
      console.log('[Patch] Variables before .random:', [...xxxRandomVars]);
      
      // Patch：将 XXX.random 替换为 (XXX && XXX.random) || Math.random
      // 这样如果 XXX 是 undefined，就用 Math.random 代替
      var patched = code;
      xxxRandomVars.forEach(function(varName) {
        if (varName === 'Math') return; // Math.random 不需要 patch
        var pattern = new RegExp(varName.replace(/\$/g, '\\$') + '\\.random', 'g');
        patched = patched.replace(pattern, '(' + varName + '&&' + varName + '.random?'+varName+'.random():Math.random())');
      });
      
      console.log('[Patch] Patched', xxxRandomVars.size - (xxxRandomVars.has('Math') ? 1 : 0), 'variables');
      
      // 也 patch catch blocks
      var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
      var cm; var off = 0;
      while ((cm = catchPattern.exec(patched)) !== null) {
        var e = cm[1];
        var pos = cm.index + cm[0].length + off;
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
    
    // 调用 trampoline
    console.log('\n[2] 调用 trampoline...');
    var xhr = new window.XMLHttpRequest();
    window.XMLHttpRequest.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    Object.getOwnPropertyNames(xhr).forEach(function(k) {
      if (k.indexOf('_$') === 0 && typeof xhr[k] === 'boolean') xhr[k] = true;
    });
    var tramp = null;
    Object.getOwnPropertyNames(xhr).forEach(function(k) {
      if (k.indexOf('_$') === 0 && typeof xhr[k] === 'function') tramp = xhr[k];
    });
    
    if (tramp) {
      var result = '';
      try { result = tramp.call(xhr, '{}') || ''; } catch(e) { console.log('  Tramp error:', e.message.substring(0, 80)); }
      console.log('  Result length:', result.length);
      if (result.length > 10) {
        console.log('  Result:', result.substring(0, 80));
        console.log('\n★★★ QUERY FROM TRAMPOLINE! ★★★');
      }
    }
    
    var catches = window.__ce || [];
    console.log('  Catches:', catches.length);
    var seen = new Set();
    catches.forEach(function(c) { if (!seen.has(c)) { seen.add(c); console.log('    -', c); } });
    
    // 调用 send
    console.log('\n[3] 调用 send...');
    window.__ce = [];
    var xhr2 = new window.XMLHttpRequest();
    xhr2.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    Object.getOwnPropertyNames(xhr2).forEach(function(k) {
      if (k.indexOf('_$') === 0 && typeof xhr2[k] === 'boolean') xhr2[k] = true;
    });
    
    try {
      xhr2.send('{}');
      console.log('  Send OK');
      console.log('  responseURL:', xhr2.responseURL ? xhr2.responseURL.substring(0, 100) : 'none');
      if (xhr2.responseURL && xhr2.responseURL.indexOf('r20SZOQm=') >= 0) {
        var qMatch = xhr2.responseURL.match(/r20SZOQm=([^&]+)/);
        console.log('\n★★★ QUERY FROM SEND! ★★★');
        console.log('  Query:', qMatch[1]);
      }
    } catch(e) {
      console.log('  Send error:', e.message.substring(0, 100));
    }
    
    var catches2 = window.__ce || [];
    console.log('\n  Catches after send:', catches2.length);
    var seen2 = new Set();
    catches2.forEach(function(c) { if (!seen2.has(c)) { seen2.add(c); console.log('    -', c); } });
  }
  
  window.close();
  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
