/**
 * query_jsdom_vm2.js - jsdom + catch logging + send 调用
 *
 * jsdom 中 RS 成功 hook 了 XHR！
 * 但 trampoline 返回空字符串
 * 
 * 需要检查：
 * 1. catch 块异常
 * 2. 调用 send（不是 trampoline）
 * 3. 检查 VM 内部状态
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
  console.log('=== jsdom + catch logging + send ===\n');

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

  // 获取动态代码（用于 patch catch blocks）
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
  
  // 捕获 URL 修改
  var capturedUrl = null;
  
  // 执行 RS（先执行外层 JS，让 RS 设置 eval hook）
  // 然后在 eval 动态代码时 patch catch blocks
  var origWindowEval = window.eval;
  var dynCodePatched = false;
  
  // jsdom 的 runScripts: 'outside-only' 意味着 <script> 标签不自动执行
  // 我们手动用 window.eval 执行
  // RS 外层 JS 会调用 eval() 来执行动态代码
  // 我们需要 hook eval 来 patch 动态代码
  
  // 但 jsdom 的 window.eval 是原生函数
  // RS 外层 JS 中的 eval 调用的是全局 eval
  // 我们需要替换 window.eval
  
  window.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !dynCodePatched) {
      dynCodePatched = true;
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
      return origWindowEval.call(window, patched);
    }
    return origWindowEval.call(window, code);
  };
  
  console.log('[1] 执行 RS...');
  try { origWindowEval.call(window, outerJsCode); } catch(e) { console.log('  Error:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 3000));
  
  // 检查 RS hook
  var sendName = window.XMLHttpRequest.prototype.send.name;
  console.log('  send.name:', sendName);
  console.log('  RS hooked:', sendName.indexOf('_$') === 0 ? 'YES' : 'NO');
  
  if (sendName.indexOf('_$') === 0) {
    // 清空 catch log
    window.__ce = [];
    
    // 创建 XHR
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
    
    // 检查 catch log
    var catches = window.__ce || [];
    console.log('  Catches:', catches.length);
    var seen = new Set();
    catches.forEach(function(c) { if (!seen.has(c)) { seen.add(c); console.log('    -', c); } });
    
    // 关键：调用 send（不是 trampoline）
    console.log('\n[3] 调用 send...');
    window.__ce = [];
    
    var xhr2 = new window.XMLHttpRequest();
    // 用 RS 的 open hook
    xhr2.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    
    // 检查 open 后的实例属性
    var rsProps2 = {};
    Object.getOwnPropertyNames(xhr2).forEach(function(k) {
      if (k.indexOf('_$') === 0) rsProps2[k] = typeof xhr2[k];
    });
    console.log('  RS props after open:', JSON.stringify(rsProps2));
    
    // 设置 boolean 为 true
    Object.getOwnPropertyNames(xhr2).forEach(function(k) {
      if (k.indexOf('_$') === 0 && typeof xhr2[k] === 'boolean') xhr2[k] = true;
    });
    
    // 调用 send
    try {
      xhr2.send('{}');
      console.log('  Send completed');
      console.log('  readyState:', xhr2.readyState);
      console.log('  status:', xhr2.status);
      console.log('  responseURL:', xhr2.responseURL ? xhr2.responseURL.substring(0, 80) : 'none');
      
      // 检查 URL 是否被修改
      if (xhr2.responseURL && xhr2.responseURL.indexOf('r20SZOQm=') >= 0) {
        var qMatch = xhr2.responseURL.match(/r20SZOQm=([^&]+)/);
        if (qMatch) {
          console.log('\n★★★ Query from responseURL:', qMatch[1].substring(0, 60) + '...');
        }
      }
    } catch(e) {
      console.log('  Send error:', e.message.substring(0, 80));
    }
    
    // 检查 catch log
    var catches2 = window.__ce || [];
    console.log('\n  Catches after send:', catches2.length);
    var seen2 = new Set();
    catches2.forEach(function(c) { if (!seen2.has(c)) { seen2.add(c); console.log('    -', c); } });
    
    // 检查 cookie 更新
    console.log('\n[4] Cookie 更新...');
    console.log('  Total cookies:', cookies.length);
    cookies.slice(-5).forEach(function(c, i) {
      console.log('  [' + i + ']', c.substring(0, 80));
    });
    
    // 检查 $_ts
    console.log('\n[5] $_ts 状态...');
    console.log('  keys:', Object.keys(window.$_ts || {}));
    console.log('  hasCp:', !!(window.$_ts && window.$_ts.cp));
    
    // 关键：检查 boolean flag
    console.log('\n[6] Boolean flag...');
    Object.getOwnPropertyNames(xhr2).forEach(function(k) {
      if (k.indexOf('_$') === 0 && typeof xhr2[k] === 'boolean') {
        console.log('  ' + k + ' =', xhr2[k]);
      }
    });
  }
  
  window.close();
  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
