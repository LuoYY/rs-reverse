/**
 * query_vm_simulate2.js — 修复 RS hook 条件
 *
 * 问题：RS 在沙箱中没有 hook XHR
 * 原因：Maximum call stack size exceeded → RS hook 过程中递归了
 * 
 * 可能原因：
 * RS 在 hook prototype.send 时，新的 send 函数内部调用了原始 send
 * 但如果原始 send 被覆盖不正确，会导致无限递归
 * 
 * 或者：RS 的 hook 代码本身有递归调用
 * 
 * 修复方案：
 * 1. 确保 RSXHR 的 prototype 方法不会触发递归
 * 2. 增加调用栈深度限制
 * 3. 或者：手动触发 RS 的 hook 逻辑
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

function makeAnchorEl() {
  var el = { tagName:'A',nodeType:1,style:new Proxy({},{get:()=>'',set:()=>true}),children:[],childNodes:[],
    setAttribute:function(n,v){if(n==='href')this.href=String(v);},getAttribute:function(n){return n==='href'?this._href||'':null;},
    removeAttribute(){},appendChild(c){return c;},removeChild(c){return c;},addEventListener(){},removeEventListener(){},_href:'',_url:null};
  Object.defineProperty(el,'href',{get:function(){return this._href;},set:function(v){this._href=String(v);try{var b='https://pmos.xj.sgcc.com.cn:20080';try{this._url=new URL(this._href,b);}catch(e){this._url={href:this._href,protocol:'',host:'',hostname:'',port:'',pathname:this._href,search:'',hash:'',origin:b};}}catch(e){}},configurable:true});
  ['protocol','host','hostname','port','pathname','search','hash','origin'].forEach(function(p){Object.defineProperty(el,p,{get:function(){return this._url?(this._url[p]||''):'';},set:function(){},configurable:true});});
  el.innerHTML='';el.innerText='';el.textContent='';el.className='';el.id='';el.clientWidth=0;el.clientHeight=0;
  el.getBoundingClientRect=function(){return{top:0,left:0,right:0,bottom:0,width:0,height:0};};
  el.getElementsByTagName=function(){return[];};el.querySelector=function(){return null;};el.querySelectorAll=function(){return[];};
  el.cloneNode=function(){return makeAnchorEl();};el.remove=function(){};el.parentNode=null;el.parentElement=null;el.firstChild=null;el.lastChild=null;el.nextSibling=null;
  return el;
}

(async () => {
  console.log('=== 修复 RS hook 条件 ===\n');

  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  var nsd = +(ch.body.match(/nsd=(\d+)/)||[])[1];
  var cd = (ch.body.match(/cd="([^"]+)"/)||[])[1];
  var sc = [].concat(ch.headers['set-cookie'] || []);
  var oCookie = sc.map(c => c.split(';')[0]).find(c => c.indexOf('O=') >= 0) || sc[0].split(';')[0];
  
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var client = new PmosXjClientProxy();
  await client.init();
  var cp3 = client._extractCp3(nsd, cd);
  var gen = await client._genCookie({nsd,cd,from:'https://pmos.xj.sgcc.com.cn:20080/',hasDebug:false,keynameNum:909,cp3Override:cp3}, cp3);
  var seedCookie = oCookie + '; ' + gen.name + '=' + gen.cookie;

  // RSXHR — 确保 prototype 方法安全
  function RSXHR(){
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.responseURL = '';
    this.response = '';
    this._url = '';
  }
  // 用 Object.defineProperty 确保 writable + configurable
  // RS 需要 writable:true 才能替换
  Object.defineProperty(RSXHR.prototype, 'open', {
    value: function(method, url) { this._url = String(url); this.readyState = 1; },
    writable: true, configurable: true,
  });
  Object.defineProperty(RSXHR.prototype, 'send', {
    value: function(body) { this.readyState = 4; this.status = 200; this.responseText = '{}'; },
    writable: true, configurable: true,
  });
  Object.defineProperty(RSXHR.prototype, 'setRequestHeader', { value: function(){}, writable: true, configurable: true });
  Object.defineProperty(RSXHR.prototype, 'abort', { value: function(){}, writable: true, configurable: true });
  Object.defineProperty(RSXHR.prototype, 'getAllResponseHeaders', { value: function(){return '';}, writable: true, configurable: true });
  Object.defineProperty(RSXHR.prototype, 'getResponseHeader', { value: function(){return null;}, writable: true, configurable: true });
  Object.defineProperty(RSXHR.prototype, 'overrideMimeType', { value: function(){}, writable: true, configurable: true });
  Object.defineProperty(RSXHR.prototype, 'addEventListener', { value: function(){}, writable: true, configurable: true });
  Object.defineProperty(RSXHR.prototype, 'removeEventListener', { value: function(){}, writable: true, configurable: true });
  Object.defineProperty(RSXHR.prototype, 'dispatchEvent', { value: function(){return true;}, writable: true, configurable: true });

  const env = buildEnv({ nsd, cd }, { seedCookie });
  env.sandbox.document.createElement = function(tag) { return String(tag).toLowerCase()==='a' ? makeAnchorEl() : env.sandbox.document.createElement.call(this,tag); };
  env.sandbox.document = new Proxy(env.sandbox.document, { get(t,p){if(p==='cookie')return seedCookie;return t[p];}, set(t,p,v){if(p==='cookie')return true;t[p]=v;return true;} });
  env.sandbox.XMLHttpRequest = RSXHR;

  // 增加调用栈深度
  // Node.js 默认栈深度约 10000
  // RS VM 可能需要更深的栈

  let dynCode = null;
  const origEval = env.sandbox.eval;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !dynCode) {
      dynCode = code;
      // Patch catch blocks
      var patched = code;
      var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
      var match;
      var offset = 0;
      while ((match = catchPattern.exec(code)) !== null) {
        var errVar = match[1];
        var insertPos = match.index + match[0].length + offset;
        var insert = 'if(!window.__ce)window.__ce=[];try{window.__ce.push(String(' + errVar + '&&' + errVar + '.message||' + errVar + ').substring(0,80));}catch(_$ign){}';
        patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
        offset += insert.length;
      }
      return origEval.call(this, patched);
    }
    return origEval.call(this, code);
  };

  // 执行
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env.proxied, { timeout: 30000 }); } catch(e) {
    console.log('Outer JS error:', e.message.substring(0, 80));
  }
  await new Promise(r => setTimeout(r, 2000));

  // 检查 prototype
  var check = vm.runInContext(`
    (function(){
      var result = {};
      var proto = XMLHttpRequest.prototype;
      result.sendName = proto.send ? proto.send.name : 'none';
      result.openName = proto.open ? proto.open.name : 'none';
      
      try {
        result.sendStr = proto.send ? proto.send.toString().substring(0, 60) : 'none';
      } catch(e) { result.sendStr = 'err'; }
      
      // 创建 XHR 并 open
      try {
        var xhr = new XMLHttpRequest();
        proto.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
        var rs = {};
        Object.getOwnPropertyNames(xhr).forEach(function(k){ if(k.indexOf('_$')===0) rs[k]=typeof xhr[k]; });
        result.rsProps = rs;
        result.rsCount = Object.keys(rs).length;
      } catch(e) { result.xhrError = e.message.substring(0, 80); }
      
      return JSON.stringify(result);
    })()
  `, env.proxied);
  
  var parsed = JSON.parse(check);
  console.log('send name:', parsed.sendName);
  console.log('open name:', parsed.openName);
  console.log('send str:', parsed.sendStr);
  console.log('RS props:', JSON.stringify(parsed.rsProps), 'count:', parsed.rsCount);

  // 检查 catch
  var catches = vm.runInContext('window.__ce || []', env.proxied);
  console.log('\nCatches:', catches.length);
  var seen = new Set();
  catches.forEach(function(c) { if (!seen.has(c)) { seen.add(c); console.log('  -', c); } });

  // 检查 errors
  console.log('\nErrors:', env.captured.errors.length);
  env.captured.errors.slice(0, 5).forEach(function(e) { console.log('  -', e.substring(0, 80)); });

  // 如果 RS hooked
  if (parsed.sendName && parsed.sendName.indexOf('_$') === 0) {
    console.log('\n★★★ RS hooked prototype! ★★★');
    
    // 调用 trampoline
    var trampResult = vm.runInContext(`
      (function(){
        try {
          var xhr = new XMLHttpRequest();
          XMLHttpRequest.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
          Object.getOwnPropertyNames(xhr).forEach(function(k){ if(k.indexOf('_$')===0 && typeof xhr[k]==='boolean') xhr[k]=true; });
          var tramp = null;
          Object.getOwnPropertyNames(xhr).forEach(function(k){ if(k.indexOf('_$')===0 && typeof xhr[k]==='function') tramp = xhr[k]; });
          if (!tramp) return 'no tramp';
          var r = tramp.call(xhr, '{}');
          return 'len:' + (typeof r === 'string' ? r.length : -1) + ' val:' + String(r).substring(0, 80);
        } catch(e) { return 'error:' + e.message.substring(0, 80); }
      })()
    `, env.proxied);
    console.log('Trampoline:', trampResult);
  }

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
