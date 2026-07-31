/**
 * query_find_recursion2.js - 最小化测试，逐步添加组件
 * 
 * 最小沙箱导致 V8 崩溃（Fatal JavaScript invalid size error）
 * 需要更谨慎地构建沙箱
 * 
 * 方案：用 buildEnv 作为基础，但逐步禁用可能有问题的组件
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const fs = require('fs'), path = require('path'), vm = require('vm');
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
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
  console.log('=== 逐步排查递归 ===\n');

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

  // 配置 RSXHR
  function setupXHR(env) {
    function RSXHR(){this.readyState=0;this.status=0;this.responseText='';this.responseURL='';}
    RSXHR.prototype.open=function(m,u){this._url=String(u);this.readyState=1;};
    RSXHR.prototype.send=function(b){this.readyState=4;this.status=200;this.responseText='{}';};
    RSXHR.prototype.setRequestHeader=function(){};RSXHR.prototype.abort=function(){};
    RSXHR.prototype.getAllResponseHeaders=function(){return '';};RSXHR.prototype.getResponseHeader=function(){return null;};
    RSXHR.prototype.overrideMimeType=function(){};RSXHR.prototype.addEventListener=function(){};RSXHR.prototype.removeEventListener=function(){};
    env.sandbox.XMLHttpRequest = RSXHR;
    return RSXHR;
  }

  function testEnv(label, envModFn) {
    return new Promise(async (resolve) => {
      console.log('\n--- ' + label + ' ---');
      var env = buildEnv({ nsd, cd }, { seedCookie });
      env.sandbox.document.createElement = function(tag) { return String(tag).toLowerCase()==='a'?makeAnchorEl():env.sandbox.document.createElement.call(this,tag); };
      env.sandbox.document = new Proxy(env.sandbox.document, { get(t,p){if(p==='cookie')return seedCookie;return t[p];}, set(t,p,v){if(p==='cookie')return true;t[p]=v;return true;} });
      setupXHR(env);
      
      // 应用修改
      if (envModFn) envModFn(env);
      
      let dynCode = null;
      const origEval = env.sandbox.eval;
      env.sandbox.eval = function(code) { if (typeof code==='string'&&code.length>50000&&!dynCode) dynCode=code; return origEval.call(this, code); };
      
      try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env.proxied, { timeout: 15000 }); } catch(e) {
        console.log('  Outer error:', e.message.substring(0, 80));
      }
      await new Promise(r => setTimeout(r, 2000));
      
      var sendName = vm.runInContext('(XMLHttpRequest.prototype.send||{}).name||"none"', env.proxied);
      console.log('  send.name:', sendName);
      console.log('  errors:', env.captured.errors.length);
      env.captured.errors.slice(0, 3).forEach(function(e) { console.log('    -', e.substring(0, 80)); });
      
      var xhrCheck = vm.runInContext('(function(){try{var x=new XMLHttpRequest();x.open("POST","/test",true);var r={};Object.getOwnPropertyNames(x).forEach(function(k){if(k.indexOf("_$")===0)r[k]=typeof x[k];});return JSON.stringify({count:Object.keys(r).length});}catch(e){return e.message;}})()', env.proxied);
      console.log('  XHR:', xhrCheck);
      
      if (sendName.indexOf('_$') === 0) {
        console.log('  ★★★ RS HOOKED! ★★★');
        var trampR = vm.runInContext('(function(){try{var x=new XMLHttpRequest();x.open("POST","/px-gateway/GatewayConfig/getGatewayConfig",true);Object.getOwnPropertyNames(x).forEach(function(k){if(k.indexOf("_$")===0&&typeof x[k]==="boolean")x[k]=true;});var t=null;Object.getOwnPropertyNames(x).forEach(function(k){if(k.indexOf("_$")===0&&typeof x[k]==="function")t=x[k];});if(!t)return"no tramp";var r=t.call(x,"{}");return"len:"+(typeof r==="string"?r.length:-1)+" val:"+String(r).substring(0,80);}catch(e){return"err:"+e.message.substring(0,80);}})()', env.proxied);
        console.log('  Trampoline:', trampR);
      }
      
      resolve(sendName);
    });
  }

  // 测试1: buildEnv 原版（有 Proxy wrapper, Z8XHJJY, setTimeout 同步执行）
  await testEnv('原版 buildEnv');

  // 测试2: Z8XHJJY 返回 undefined（不返回函数）
  await testEnv('Z8XHJJY 返回 undefined', function(env) {
    env.sandbox.Z8XHJJY = new Proxy({}, { get: () => undefined });
  });

  // 测试3: setTimeout 不执行
  await testEnv('setTimeout 不执行', function(env) {
    env.sandbox.setTimeout = function() { return 0; };
    env.sandbox.queueMicrotask = function() {};
  });

  // 测试4: Z8XHJJY + setTimeout 都不执行
  await testEnv('Z8XHJJY=undef + setTimeout=nop', function(env) {
    env.sandbox.Z8XHJJY = new Proxy({}, { get: () => undefined });
    env.sandbox.setTimeout = function() { return 0; };
    env.sandbox.queueMicrotask = function() {};
  });

  // 测试5: 移除 sandbox Proxy wrapper
  await testEnv('无 Proxy wrapper', function(env) {
    // 不能移除 Proxy wrapper（buildEnv 内部依赖）
    // 但可以修改 Proxy 的行为
  });

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
