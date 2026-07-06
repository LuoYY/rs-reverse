// Run the pmos inner VM (dynamic.js) with a mocked browser environment (补环境)
// to capture the real cookie, then extract the basearr/[0] block.
const path = require('path');
const fs = require('fs');
require('module-alias')(path.dirname(require('./utils/paths').package));
const gv = require('@src/handler/globalVarible');
const { initGv, getCode } = require('@utils/');
const Coder = require('@src/handler/Coder');

// re-use the decrypt machinery from decrypt_cookie.js
const { numarr2stringDecode, numarrDecrypt } = (() => {
  // huffman decode
  function getTree(){let arr=[];for(let i=1;i<255;i++)arr.push({total:1,idx:i});arr.push({total:6,idx:255},{total:45,idx:0});function parse(item){for(let i=0;i<arr.length;i++){if(item.total<=arr[i].total){arr.splice(i,0,item);return;}}arr.push(item);}while(arr.length>1){const[o,t]=arr.slice(0,2);arr=arr.slice(2);parse({total:o.total+t.total,first:o,second:t});}return arr[0];}
  function getKey(arr){for(let idx in arr){if(arr[idx].val>=8)return arr[idx].key>>arr[idx].val-8;}}
  function getEncryptConfig(tree,config={key:0,val:0},arr=[]){if(tree.idx===undefined){getEncryptConfig(tree.first,{key:config.key<<1,val:config.val+1},arr);getEncryptConfig(tree.second,{key:(config.key<<1)+1,val:config.val+1},arr);}else{arr[tree.idx]=config;}return[arr,getKey(arr)];}
  const encCfg=getEncryptConfig(getTree());const codeMap={};for(let b=0;b<256;b++){const c=encCfg[0][b];if(!c)continue;if(!codeMap[c.val])codeMap[c.val]={};codeMap[c.val][c.key]=b;}
  function numarrDecrypt(numarr){const ans=[];let curLen=0,curKey=0;for(let i=0;i<numarr.length;i++){for(let bit=7;bit>=0;bit--){curKey=(curKey<<1)|((numarr[i]>>bit)&1);curLen++;const m=codeMap[curLen];if(m&&m[curKey]!==undefined){ans.push(m[curKey]);curKey=0;curLen=0;}}}return ans;}
  function numarr2stringDecode(str){const keys=gv.basestr.split('');const idxmap={};keys.forEach((k,i)=>{if(!(k in idxmap))idxmap[k]=i;});const numarr=[];let i=0;const full=Math.floor(str.length/4);for(let g=0;g<full;g++){const c0=idxmap[str[i]],c1=idxmap[str[i+1]],c2=idxmap[str[i+2]],c3=idxmap[str[i+3]];i+=4;numarr.push((c0<<2)|(c1>>4),((c1&15)<<4)|(c2>>2),((c2&3)<<6)|c3);}const rem=str.length-i;if(rem===2){const c0=idxmap[str[i]],c1=idxmap[str[i+1]];numarr.push((c0<<2)|(c1>>4));}else if(rem===3){const c0=idxmap[str[i]],c1=idxmap[str[i+1]],c2=idxmap[str[i+2]];numarr.push((c0<<2)|(c1>>4),((c1&15)<<4)|(c2>>2));}return numarr;}
  return { numarr2stringDecode, numarrDecrypt };
})();

(async () => {
  const codeRet = await getCode(['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js']);
  // init gv (sets gv.config + gv.ts via Coder)
  gv.wrap(initGv)({ file: 'output/pmos-ts.json', jsurls: codeRet });
  const $_tsRaw = gv.ts;
  $_tsRaw.lcd = undefined;
  $_tsRaw.jf = true; // format-check flag; project computes false, VM may expect true
  // wrap $_ts in a logging proxy to see what VM reads
  const tsAccess = [];
  const $_ts = new Proxy($_tsRaw, {
    get(t, prop) {
      if (typeof prop === 'string') tsAccess.push('$_ts.' + prop);
      return t[prop];
    },
    has() { return true; },
  });

  // load dynamic.js code
  const dynPath = 'output/makecode/rGTR1U4jJCVr.303c6e9-dynamic.js';
  const dynCode = fs.readFileSync(dynPath, 'utf8').replace(/^\/\/.*\n\n/, '');

  // ---- build a lazy browser mock (补环境) ----
  const runtime = require('@src/config/makecookieRuntimeConfig');
  // "any" proxy: returns 0 in numeric, '' in string, callable, nestable. Won't crash.
  function anyProxy(name) {
    const f = function() { return anyProxy(name + '()'); };
    return new Proxy(f, {
      get(t, prop) {
        if (typeof prop === 'symbol') {
          if (prop === Symbol.toPrimitive) return () => 0;
          if (prop === Symbol.iterator) return function*(){};
          return undefined;
        }
        if (prop === 'length') return 0;
        if (prop === 'valueOf') return () => 0;
        if (prop === 'toString') return () => '';
        if (prop === 'nodeType') return 0;
        if (prop === 'then') return undefined;
        return anyProxy(name + '.' + String(prop));
      },
      set() { return true; },
      has() { return true; },
      apply() { return anyProxy(name + '()'); },
      construct() { return anyProxy(name + 'new'); },
    });
  }
  function lazyProxy(name) { return anyProxy(name); }

  let capturedCookie = null;
  const navigatorObj = {
    userAgent: runtime['window.navigator.userAgent'],
    platform: runtime['window.navigator.platform'],
    maxTouchPoints: runtime['window.navigator.maxTouchPoints'],
    connection: { connType: 'wifi', effectiveType: '4g', downlink: 6.66, rtt: 0, saveData: false },
    battery: { charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1 },
    appVersion: '5.0 (Macintosh)',
    language: 'zh-CN',
    languages: ['zh-CN','zh'],
    cookieEnabled: true,
    doNotTrack: null,
    plugins: { length: 0 },
    mimeTypes: { length: 0 },
  };
  const screenObj = { width: 1680, height: 1050, availWidth: 1680, availHeight: 1050, colorDepth: 24, pixelDepth: 24 };
  const documentObj = {
    cookie: '',
    hidden: runtime['window.document.hidden'],
    visibilityState: runtime['window.document.hidden'] ? 'hidden' : 'visible',
    domain: 'pmos.xj.sgcc.com.cn',
    referrer: '',
    URL: 'https://pmos.xj.sgcc.com.cn:20080/',
    readyState: 'complete',
    characterSet: 'UTF-8',
    documentElement: lazyProxy('documentElement'),
    body: lazyProxy('body'),
    head: lazyProxy('head'),
    location: null,
    createElement: () => lazyProxy('element'),
    getElementById: () => null,
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const locationObj = {
    href: 'https://pmos.xj.sgcc.com.cn:20080/',
    protocol: 'https:',
    host: 'pmos.xj.sgcc.com.cn:20080',
    hostname: 'pmos.xj.sgcc.com.cn',
    port: '20080',
    pathname: '/',
    search: '',
    hash: '',
  };
  documentObj.location = locationObj;
  const windowObj = {
    navigator: navigatorObj,
    document: documentObj,
    screen: screenObj,
    location: locationObj,
    innerWidth: runtime['window.innerWidth'],
    innerHeight: runtime['window.innerHeight'],
    outerWidth: runtime['window.outerWidth'],
    outerHeight: runtime['window.outerHeight'],
    devicePixelRatio: 2,
    name: runtime['window.name'],
    pageXOffset: 0, pageYOffset: 0, scrollX: 0, scrollY: 0,
    history: { length: 1, pushState: () => {}, replaceState: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    performance: { timing: {}, now: () => 0, navigation: {} },
    addEventListener: () => {}, removeEventListener: () => {},
    setTimeout: (fn) => fn && fn(),
    setInterval: () => 0,
    clearTimeout: () => {}, clearInterval: () => {},
    eval: eval,
    parseInt, parseFloat, isNaN, isFinite,
    String, Number, Boolean, Array, Object, Math, Date, JSON, RegExp, Error,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    XMLHttpRequest: function(){ return { open(){}, send(){}, setRequestHeader(){}, addEventListener(){} }; },
  };
  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObj.top = windowObj;
  windowObj.parent = windowObj;
  windowObj.globalThis = windowObj;
  windowObj.$_ts = $_ts; // VM accesses window['$_ts'] to read cp
  windowObj.location = locationObj;
  // wrap window in a proxy that returns undefined for unknown props (so feature-detection like ActiveXObject fails correctly)
  const windowProxy = new Proxy(windowObj, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      if (typeof prop === 'string') accessLog.push('window.' + prop);
      return undefined; // unknown props = undefined (not IE, etc.)
    },
    set(t, prop, val) {
      if (prop === '$_ts') { /* ignore */ return true; }
      t[prop] = val; return true;
    },
    has() { return true; },
  });
  // add modern browser features the VM may use
  windowObj.DOMParser = function(){ this.parseFromString = ()=>({}); };
  windowObj.XMLHttpRequest = function(){ this.open=()=>{}; this.send=()=>{}; this.setRequestHeader=()=>{}; this.addEventListener=()=>{}; this.responseText=''; this.status=200; };
  windowObj.Image = function(){};
  windowObj.fetch = () => Promise.resolve({ text: () => Promise.resolve('') });
  windowObj.alert = () => {}; windowObj.confirm = () => false; windowObj.prompt = () => '';
  windowObj.postMessage = () => {};
  windowObj.requestAnimationFrame = (fn) => fn && fn();
  windowObj.getComputedStyle = () => ({ getPropertyValue: () => '' });
  windowObj.matchMedia = () => ({ matches: false, addEventListener: () => {} });
  // storage features (VM loops checking these)
  windowObj.indexedDB = { open: () => ({ onsuccess: null, onerror: null, onupgradeneeded: null, result: {} }), deleteDatabase: () => ({}) };
  windowObj.globalStorage = {};
  windowObj.webkitIndexedDB = windowObj.indexedDB;
  windowObj.mozIndexedDB = windowObj.indexedDB;
  windowObj.msIndexedDB = windowObj.indexedDB;
  windowObj.openDatabase = function(){};
  // real global functions on window
  windowObj.escape = escape; windowObj.unescape = unescape; windowObj.eval = eval;
  windowObj.parseInt = parseInt; windowObj.parseFloat = parseFloat; windowObj.isNaN = isNaN; windowObj.isFinite = isFinite;
  windowObj.encodeURIComponent = encodeURIComponent; windowObj.decodeURIComponent = decodeURIComponent;
  windowObj.encodeURI = encodeURI; windowObj.decodeURI = decodeURI;
  windowObj.String = String; windowObj.Number = Number; windowObj.Boolean = Boolean;
  windowObj.Array = Array; windowObj.Object = Object; windowObj.Math = Math; windowObj.Date = Date;
  windowObj.JSON = JSON; windowObj.RegExp = RegExp; windowObj.Error = Error; windowObj.Function = Function;
  windowObj.Symbol = Symbol; windowObj.Promise = Promise; windowObj.Map = Map; windowObj.Set = Set;
  windowObj.Uint8Array = Uint8Array; windowObj.Int32Array = Int32Array; windowObj.ArrayBuffer = ArrayBuffer;
  windowObj.Buffer = undefined; // node-ism, hide
  // try defining IE features to break the detection loop
  windowObj.ActiveXObject = undefined;
  windowObj.CollectGarbage = undefined;
  windowObj.onerror = null;
  windowObj.onbeforeunload = null;
  windowObj.onload = null;
  windowObj.onunload = null;

  // capture cookie via document.cookie setter
  let cookieSet = '';
  Object.defineProperty(documentObj, 'cookie', {
    get() { return cookieSet; },
    set(v) {
      cookieSet = v;
      capturedCookie = v;
      console.log('[CAPTURED document.cookie]', String(v).substring(0, 80));
    },
    configurable: true,
  });

  // run the inner VM in a sandbox
  const vm = require('vm');
  // wrap Array constructor to tolerate invalid lengths (from mocked props)
  const SafeArray = new Proxy(Array, {
    construct(t, args, newTarget) {
      if (args.length === 1) {
        let n = args[0];
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e7 || Math.floor(n) !== n) n = 0;
        args[0] = n;
      }
      return Reflect.construct(t, args, newTarget);
    },
    apply(t, thisArg, args) {
      if (args.length === 1) {
        let n = args[0];
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e7 || Math.floor(n) !== n) n = 0;
        args[0] = n;
      }
      return Reflect.apply(t, thisArg, args);
    },
  });
  const accessLog = [];
  function logAccess(obj, prop) { accessLog.push(obj + '.' + String(prop)); }
  // wrap navigator/document/screen in logging proxies
  function logProxy(obj, name) {
    return new Proxy(obj, {
      get(t, prop) {
        if (typeof prop === 'string') logAccess(name, prop);
        return t[prop];
      },
      set(t, prop, val) { t[prop] = val; return true; },
      has() { return true; },
    });
  }
  const sandbox = {
    $_ts,
    window: windowProxy,
    document: logProxy(documentObj, 'document'),
    navigator: logProxy(navigatorObj, 'navigator'),
    screen: logProxy(screenObj, 'screen'),
    location: locationObj,
    self: windowProxy,
    top: windowProxy,
    parent: windowProxy,
    setTimeout: (fn)=>fn&&fn(), setInterval:()=>0, clearTimeout:()=>{}, clearInterval:()=>{},
    parseInt, parseFloat, isNaN, isFinite,
    String, Number, Boolean, Object, Math, Date, JSON, RegExp, Error, Function,
    Array: SafeArray,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    escape, unescape,
    console: { log: (...a)=>accessLog.push('[log]'+a.map(String).join(' ').substring(0,100)), warn: ()=>{}, error: (...a)=>console.error('[VM]', ...a) },
    performance: { timing: {}, now: ()=>0, navigation: {} },
    history: { length: 1 },
    outerWidth: runtime['window.outerWidth'], outerHeight: runtime['window.outerHeight'],
    innerWidth: runtime['window.innerWidth'], innerHeight: runtime['window.innerHeight'],
    devicePixelRatio: 2,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = windowProxy;

  try {
    vm.createContext(sandbox);
    // patch while(1) loops with an opcode counter to detect infinite loops
    let patched = dynCode.replace(/while\(1\)\{/g, 'while(1){if(++__opc>30000000) throw new Error("OPC_LIMIT");');
    patched = 'var __opc=0; ' + patched;
    // also expose a logging $_ts proxy
    vm.runInContext(patched, sandbox, { timeout: 120000 });
    console.log('VM execution completed. opcodes:', sandbox.__opc);
  } catch (err) {
    console.error('VM error:', err.message, 'opcodes:', sandbox.__opc);
  }
  // dump $_ts access log
  fs.writeFileSync('/tmp/ts_access.log', tsAccess.join('\n'));
  console.log('$_ts accesses (unique):', [...new Set(tsAccess)].join(', '));
  console.log('$_ts access count:', tsAccess.length);
  // dump access log
  fs.writeFileSync('/tmp/vm_access.log', accessLog.slice(-200).join('\n'));
  console.log('access log (last 30):', accessLog.slice(-30).join(', '));
  console.log('capturedCookie:', capturedCookie ? capturedCookie.substring(0, 120) : 'NONE');
})();
