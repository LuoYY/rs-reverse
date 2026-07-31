/**
 * query_find_recursion.js — 二分法定位递归源头
 *
 * 逐步移除 buildEnv 组件，找到导致 Maximum call stack 的那个
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path'), vm = require('vm');
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');

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

// 构建最小沙箱（不含 buildEnv 的 Proxy/Z8XHJJY/setTimeout）
function buildMinimalEnv(nsd, cd, seedCookie) {
  const document = {
    _cookie: seedCookie,
    get cookie() { return this._cookie; },
    set cookie(v) { this._cookie = v; },
    createElement: function(tag) { return makeAnchorEl(); },
    createElementNS: function(ns, tag) { return makeAnchorEl(); },
    createTextNode: (t) => ({ textContent: t }),
    createDocumentFragment: () => makeAnchorEl(),
    getElementsByTagName: () => [], getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    documentElement: makeAnchorEl(), body: makeAnchorEl(), head: makeAnchorEl(),
    hidden: false, visibilityState: 'visible', readyState: 'complete',
    addEventListener() {}, removeEventListener() {},
    referrer: '', title: '', characterSet: 'UTF-8', charset: 'UTF-8',
    compatMode: 'CSS1Compat', domain: 'pmos.xj.sgcc.com.cn',
    implementation: { createHTMLDocument: () => document },
  };
  const navigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'MacIntel', maxTouchPoints: 0, appName: 'Netscape',
    appVersion: '5.0', appCodeName: 'Mozilla', product: 'Gecko', productSub: '20030107', vendor: 'Google Inc.', vendorSub: '',
    language: 'zh-CN', languages: ['zh-CN', 'zh'],
    cookieEnabled: true, hardwareConcurrency: 8, deviceMemory: 8,
    onLine: true, doNotTrack: null, webdriver: false,
    plugins: { length: 5, item: () => null, namedItem: () => null, refresh() {} },
    mimeTypes: { length: 2, item: () => null, namedItem: () => null },
    javaEnabled: () => false, sendBeacon: () => true,
  };
  const screen = { width: 1680, height: 1050, availWidth: 1680, availHeight: 1025, colorDepth: 24, pixelDepth: 24 };
  const location = {
    href: 'https://pmos.xj.sgcc.com.cn:20080/', pathname: '/', hostname: 'pmos.xj.sgcc.com.cn',
    protocol: 'https:', host: 'pmos.xj.sgcc.com.cn:20080', origin: 'https://pmos.xj.sgcc.com.cn:20080',
    port: '20080', search: '', hash: '', ancestorOrigins: { length: 0 },
    reload() {}, replace() {}, assign() {}, toString() { return 'https://pmos.xj.sgcc.com.cn:20080/'; },
  };
  document.location = location;

  // RSXHR — writable prototype
  function RSXHR() { this.readyState = 0; this.status = 0; this.responseText = ''; this.responseURL = ''; }
  RSXHR.prototype.open = function(m, u) { this._url = String(u); this.readyState = 1; };
  RSXHR.prototype.send = function(b) { this.readyState = 4; this.status = 200; this.responseText = '{}'; };
  RSXHR.prototype.setRequestHeader = function() {};
  RSXHR.prototype.abort = function() {};
  RSXHR.prototype.getAllResponseHeaders = function() { return ''; };
  RSXHR.prototype.getResponseHeader = function() { return null; };
  RSXHR.prototype.overrideMimeType = function() {};
  RSXHR.prototype.addEventListener = function() {};
  RSXHR.prototype.removeEventListener = function() {};

  const sandbox = {
    console, document, navigator, screen, location,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, RangeError, SyntaxError, EvalError, ReferenceError, URIError,
    Symbol, Map, Set, WeakMap, WeakSet, Promise, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Float32Array, Float64Array, ArrayBuffer, DataView, Intl, Reflect, Proxy, Function,
    parseInt, parseFloat, isNaN, isFinite, NaN, Infinity, undefined,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    // setTimeout: 异步执行（不立即调用！）
    setTimeout: function(fn) { return 0; }, // 不执行，避免递归
    setInterval: function() { return 0; }, clearInterval: function() {}, clearTimeout: function() {},
    requestAnimationFrame: function() { return 0; }, cancelAnimationFrame: function() {},
    queueMicrotask: function() {}, // 不执行
    innerWidth: 1680, innerHeight: 938, outerWidth: 1680, outerHeight: 1025, devicePixelRatio: 2,
    screenX: 0, screenY: 0, screenLeft: 0, screenTop: 0, pageXOffset: 0, pageYOffset: 0, scrollX: 0, scrollY: 0,
    history: { pushState() {}, replaceState() {}, back() {}, forward() {}, go() {}, length: 1, state: null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null },
    XMLHttpRequest: RSXHR,
    Image: function() { return makeAnchorEl(); },
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    performance: { now: () => Date.now(), timeOrigin: Date.now(), timing: { navigationStart: Date.now() }, getEntries: () => [], mark() {}, measure() {} },
    crypto: { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; }, subtle: {} },
    matchMedia: () => ({ matches: false, media: '', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    MutationObserver: function() { this.observe = () => {}; this.disconnect = () => {}; },
    URL, URLSearchParams,
    // Z8XHJJY: 简化版（不返回函数，返回 undefined 避免递归）
    Z8XHJJY: new Proxy({}, { get: (t, p) => undefined }),
    $_ts: { nsd, cd },
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox;
  sandbox.parent = sandbox; sandbox.frames = sandbox; sandbox.globalThis = sandbox;
  sandbox.chrome = { app: {}, runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

  const errors = [];
  // 不用 Proxy 包装 sandbox（避免递归）
  sandbox.eval = function(code) {
    if (typeof code !== 'string') return undefined;
    try { return vm.runInContext(code, sandbox, { timeout: 30000, filename: code.length > 50000 ? 'dyn.js' : 'small.js' }); }
    catch (e) { errors.push(e.message); return undefined; }
  };

  vm.createContext(sandbox);
  return { sandbox, errors };
}

(async () => {
  console.log('=== 定位递归源头 ===\n');

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

  // 测试1：最小沙箱（无 Proxy wrapper, 无 Z8XHJJY 函数返回, setTimeout 不执行）
  console.log('[1] 最小沙箱...');
  var env1 = buildMinimalEnv(nsd, cd, seedCookie);
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.sandbox, { timeout: 30000 }); } catch(e) {
    console.log('  Outer error:', e.message.substring(0, 80));
  }
  await new Promise(r => setTimeout(r, 2000));

  var sendName1 = vm.runInContext('(XMLHttpRequest.prototype.send||{}).name||"none"', env1.sandbox);
  console.log('  send.name:', sendName1);
  console.log('  errors:', env1.errors.length);
  env1.errors.slice(0, 3).forEach(function(e) { console.log('    -', e.substring(0, 80)); });

  // 检查 XHR 实例
  var xhrCheck1 = vm.runInContext('(function(){try{var x=new XMLHttpRequest();x.open("POST","/test",true);var r={};Object.getOwnPropertyNames(x).forEach(function(k){if(k.indexOf("_$")===0)r[k]=typeof x[k];});return JSON.stringify({props:r,count:Object.keys(r).length});}catch(e){return e.message;}})()', env1.sandbox);
  console.log('  XHR:', xhrCheck1);

  if (sendName1.indexOf('_$') === 0) {
    console.log('\n  ★★★ RS HOOKED in minimal sandbox! ★★★');
    
    // 调用 trampoline
    var trampR = vm.runInContext('(function(){try{var x=new XMLHttpRequest();x.open("POST","/px-gateway/GatewayConfig/getGatewayConfig",true);Object.getOwnPropertyNames(x).forEach(function(k){if(k.indexOf("_$")===0&&typeof x[k]==="boolean")x[k]=true;});var t=null;Object.getOwnPropertyNames(x).forEach(function(k){if(k.indexOf("_$")===0&&typeof x[k]==="function")t=x[k];});if(!t)return"no tramp";var r=t.call(x,"{}");return"len:"+(typeof r==="string"?r.length:-1)+" val:"+String(r).substring(0,80);}catch(e){return"err:"+e.message.substring(0,80);}})()', env1.sandbox);
    console.log('  Trampoline:', trampR);
  }

  // 测试2：如果最小沙箱也递归，逐步添加组件
  if (env1.errors.length > 0 && env1.errors[0].indexOf('stack') >= 0) {
    console.log('\n[2] 最小沙箱也递归，测试无 Z8XHJJY...');
    var env2 = buildMinimalEnv(nsd, cd, seedCookie);
    env2.sandbox.Z8XHJJY = undefined; // 完全移除
    try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.sandbox, { timeout: 30000 }); } catch(e) {}
    await new Promise(r => setTimeout(r, 2000));
    console.log('  errors:', env2.errors.length);
    env2.errors.slice(0, 3).forEach(function(e) { console.log('    -', e.substring(0, 80)); });
    var sendName2 = vm.runInContext('(XMLHttpRequest.prototype.send||{}).name||"none"', env2.sandbox);
    console.log('  send.name:', sendName2);
  }

  // 测试3：如果移除 Z8XHJJY 也递归，测试无 setTimeout
  console.log('\n[3] 测试 setTimeout 立即执行 vs 延迟...');
  // buildMinimalEnv 的 setTimeout 不执行
  // 如果 RS 需要 setTimeout 来异步初始化
  // 不执行 setTimeout 可能导致 RS 状态不完整

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
