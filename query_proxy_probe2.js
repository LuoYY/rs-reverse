/**
 * query_proxy_probe2.js — 增强版 Proxy 探针
 *
 * 改进点：
 * 1. document.appendChild/removeChild 是函数而非空字符串
 * 2. makeEl() 更完整（getContext 返回 canvas context stub, getInnerHTML 等）
 * 3. window 级别 Proxy（捕获 window 上缺失的属性）
 * 4. 迭代修复：每轮捕获缺失属性 → 补全 → 重跑 → 直到异常清零或 query 生成
 * 5. 深度 Proxy（递归包装：对返回的对象也加 Proxy）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

// 深度追踪 Proxy：记录所有属性访问路径
function createDeepProxy(target, path, logSet) {
  return new Proxy(target, {
    get(t, p) {
      const fullPath = path ? path + '.' + String(p) : String(p);
      if (p === Symbol.toPrimitive) return undefined;
      if (p === 'then') return undefined;
      if (p === Symbol.iterator) return t[Symbol.iterator];
      const val = t[p];
      if (val === undefined && typeof p === 'string' && p.length < 60 && !p.startsWith('Symbol')) {
        logSet.add(fullPath);
      }
      // 对返回的对象/函数递归包装（但避免循环）
      if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date) && !(val instanceof RegExp)) {
        return createDeepProxy(val, fullPath, logSet);
      }
      return val;
    },
    set(t, p, v) { t[p] = v; return true; },
    has(t, p) { return p in t; }
  });
}

// 增强版 makeEl：更完整的 DOM 元素 stub
function makeElEnhanced(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    nodeName: (tag || 'div').toUpperCase(),
    nodeType: 1,
    style: new Proxy({}, { get: (t, p) => {
      if (p === 'getPropertyValue') return () => '';
      if (p === 'setProperty') return () => {};
      if (p === 'cssText') return '';
      return '';
    }, set: () => true }),
    children: [], childNodes: [], childElementCount: 0,
    firstChild: null, lastChild: null, firstElementChild: null, lastElementChild: null,
    nextSibling: null, previousSibling: null,
    nextElementSibling: null, previousElementSibling: null,
    parentNode: null, parentElement: null,
    ownerDocument: null,
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    hasAttribute: () => false, hasAttributes: () => false,
    getElementsByTagName: () => [], getElementsByClassName: () => [],
    querySelector: () => null, querySelectorAll: () => [],
    appendChild(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; },
    removeChild(c) { return c; }, insertBefore(c) { return c; }, replaceChild(n, o) { return o; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    cloneNode: () => makeElEnhanced(tag), remove() {},
    // Canvas 相关
    getContext: (type) => {
      // 返回一个 canvas 2d context stub
      return new Proxy({}, {
        get(t, p) {
          if (p === 'canvas') return el;
          if (p === 'fillText' || p === 'strokeText' || p === 'fillRect' || p === 'strokeRect' ||
              p === 'clearRect' || p === 'beginPath' || p === 'closePath' || p === 'moveTo' ||
              p === 'lineTo' || p === 'arc' || p === 'fill' || p === 'stroke' || p === 'save' ||
              p === 'restore' || p === 'scale' || p === 'rotate' || p === 'translate' ||
              p === 'setTransform' || p === 'drawImage' || p === 'putImageData' || p === 'getImageData' ||
              p === 'createImageData' || p === 'clip' || p === 'rect' || p === 'quadraticCurveTo' ||
              p === 'bezierCurveTo' || p === 'createLinearGradient' || p === 'createRadialGradient' ||
              p === 'setLineDash' || p === 'transform' || p === 'resetTransform' || p === 'ellipse') {
            return () => {};
          }
          if (p === 'measureText') return () => ({ width: 0 });
          if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
          if (p === 'createLinearGradient' || p === 'createRadialGradient') {
            return () => ({ addColorStop() {} });
          }
          return 0;
        },
        set: () => true
      });
    },
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
    toBlob: (cb) => { if (cb) cb(new (function Blob(){})()); },
    // 布局相关
    innerHTML: '', innerText: '', textContent: '', outerHTML: '',
    className: '', id: '', name: '', title: '', lang: '', dir: '',
    clientWidth: 100, clientHeight: 100, clientLeft: 0, clientTop: 0,
    offsetWidth: 100, offsetHeight: 100, offsetLeft: 0, offsetTop: 0, offsetParent: null,
    scrollWidth: 100, scrollHeight: 100, scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 }),
    getClientRects: () => [{ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 }],
    // 属性
    attributes: [], dataset: {},
    // 表单相关
    value: '', checked: false, disabled: false, readOnly: false,
    type: 'text', placeholder: '', defaultValue: '',
    // 样式快捷属性
    hidden: false, draggable: false, tabIndex: -1,
    // classList
    classList: { add(){}, remove(){}, toggle(){return false;}, contains(){return false;}, length: 0 },
    // dataset
    // 方法
    focus() {}, blur() {}, click() {}, select() {},
    insertAdjacentHTML() {}, insertAdjacentElement() {}, insertAdjacentText() {},
    matches: () => false, closest: () => null,
    contains: () => false,
    // Symbol
    toString: () => '[object HTMLElement]',
    // contentEditable
    contentEditable: 'inherit', isContentEditable: false,
  };
  el.ownerDocument = el; // self-ref to avoid null deref
  return el;
}

(async () => {
  console.log('=== 增强版 Proxy 探针 v2 ===\n');

  // 获取挑战页
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
  console.log('Seed cookie ready, length:', seedCookie.length);

  // Pass 1: 获取动态代码
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  function RSXHR() {}
  RSXHR.prototype = {
    open: function(m,u) { this._url=String(u); this._method=String(m); this.readyState=1; },
    send: function(body) { this.readyState=4; this.status=200; this.responseText='{}'; this.response='{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    readyState:0, status:0, responseText:'', responseURL:'', response:'',
    onreadystatechange:null, onload:null, onerror:null, onprogress:null, ontimout:null,
    timeout:0, withCredentials:false, responseType:'',
    upload: { addEventListener(){}, removeEventListener(){} },
  };
  env1.sandbox.XMLHttpRequest = RSXHR;
  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  if (!dynCode) { console.log('FATAL: dynCode not captured'); process.exit(1); }
  console.log('Dynamic code captured:', dynCode.length, 'bytes');

  // Patch catch blocks
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched = dynCode;
  var match;
  var patchCount = 0;
  var offset = 0;
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset;
    var insert = 'if(!window.__ce)window.__ce=[];window.__ce.push({msg:(' + errVar + '&&' + errVar + '.message?' + errVar + '.message.substring(0,120):String(' + errVar + ').substring(0,120)),stack:(' + errVar + '&&' + errVar + '.stack?' + errVar + '.stack.split("\\n").slice(1,5).join(" | ").substring(0,300):"no-stack")});';
    patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
    offset += insert.length;
    patchCount++;
  }
  console.log('Patched', patchCount, 'catch blocks');

  // 构建增强沙箱
  const env2 = buildEnv({ nsd, cd }, { seedCookie });

  // 补全 document 上的关键方法（确保是函数而非字符串）
  const doc = env2.sandbox.document;
  // 确保 document 上的方法都是函数
  if (typeof doc.appendChild !== 'function') doc.appendChild = function(c) { return c; };
  if (typeof doc.removeChild !== 'function') doc.removeChild = function(c) { return c; };
  if (typeof doc.insertBefore !== 'function') doc.insertBefore = function(c) { return c; };
  if (typeof doc.contains !== 'function') doc.contains = function() { return false; };
  if (typeof doc.hasChildNodes !== 'function') doc.hasChildNodes = function() { return true; };
  if (typeof doc.importNode !== 'function') doc.importNode = function(n) { return n; };
  if (typeof doc.adoptNode !== 'function') doc.adoptNode = function(n) { return n; };
  if (typeof doc.createEvent !== 'function') doc.createEvent = function() { return { initEvent(){}, initCustomEvent(){} }; };
  if (typeof doc.createRange !== 'function') doc.createRange = function() { return { setStart(){}, setEnd(){}, selectNodeContents(){}, getBoundingClientRect(){return {};} }; };
  if (typeof doc.createTreeWalker !== 'function') doc.createTreeWalker = function() { return { nextNode(){return null;}, currentNode:null }; };
  if (typeof doc.createNodeIterator !== 'function') doc.createNodeIterator = function() { return { nextNode(){return null;} }; };
  if (typeof doc.evaluate !== 'function') doc.evaluate = function() { return { snapshotLength:0, snapshotItem(){return null;}, iterateNext(){return null;} }; };
  if (typeof doc.execCommand !== 'function') doc.execCommand = function() { return false; };
  if (typeof doc.queryCommandSupported !== 'function') doc.queryCommandSupported = function() { return false; };
  if (typeof doc.queryCommandEnabled !== 'function') doc.queryCommandEnabled = function() { return false; };
  if (typeof doc.exitFullscreen !== 'function') doc.exitFullscreen = function() { return Promise.resolve(); };
  if (typeof doc.fullscreenElement === 'undefined') doc.fullscreenElement = null;
  if (typeof doc.activeElement === 'undefined') doc.activeElement = makeElEnhanced('body');
  if (typeof doc.currentScript === 'undefined') doc.currentScript = null;
  if (typeof doc.scripts === 'undefined') doc.scripts = [];
  if (typeof doc.images === 'undefined') doc.images = [];
  if (typeof doc.links === 'undefined') doc.links = [];
  if (typeof doc.forms === 'undefined') doc.forms = [];
  if (typeof doc.embeds === 'undefined') doc.embeds = [];
  if (typeof doc.styleSheets === 'undefined') doc.styleSheets = [];
  if (typeof doc.all === 'undefined') doc.all = undefined; // IE 检测，Chrome 中 document.all 是 falsy 但 typeof === 'object'
  // Chrome 中 document.all 存在但 falsy
  Object.defineProperty(doc, 'all', { value: undefined, writable: false, configurable: false });
  // document.documentElement 补全
  if (!doc.documentElement || !doc.documentElement.appendChild) {
    doc.documentElement = makeElEnhanced('html');
  }
  if (!doc.body || !doc.body.appendChild) {
    doc.body = makeElEnhanced('body');
  }
  if (!doc.head || !doc.head.appendChild) {
    doc.head = makeElEnhanced('head');
  }

  // 补全 navigator
  const nav = env2.sandbox.navigator;
  if (nav.userAgentData === undefined) {
    nav.userAgentData = { brands: [{brand:'Google Chrome',version:'131'},{brand:'Chromium',version:'131'},{brand:'Not_A Brand',version:'24'}], mobile: false, platform: 'macOS', getHighEntropyValues: () => Promise.resolve({architecture:'x86', bitness:'64', model:'', platformVersion:'14.0.0', uaFullVersion:'131.0.6778.86'}) };
  }
  if (nav.brave === undefined) nav.brave = undefined; // Chrome 中不存在
  if (nav.battery === undefined) nav.battery = undefined; // 已废弃
  if (nav.getBattery === undefined) nav.getBattery = () => Promise.resolve({ charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1, addEventListener(){} });
  if (nav.clipboard === undefined) nav.clipboard = { readText: () => Promise.resolve(''), writeText: () => Promise.resolve() };
  if (nav.locks === undefined) nav.locks = { request: () => Promise.resolve(), query: () => Promise.resolve({}) };
  if (nav.wakeLock === undefined) nav.wakeLock = { request: () => Promise.resolve({}) };
  if (nav.serviceWorker === undefined) nav.serviceWorker = { controller: null, ready: Promise.resolve({}), register: () => Promise.resolve() };
  if (nav.storage === undefined) nav.storage = { estimate: () => Promise.resolve({quota: 0, usage: 0}), persist: () => Promise.resolve(false), persisted: () => Promise.resolve(false) };
  if (nav.scheduling === undefined) nav.scheduling = { isInputPending: () => false };
  if (nav.ink === undefined) nav.ink = {};
  if (nav.usb === undefined) nav.usb = { getDevices: () => Promise.resolve([]) };
  if (nav.bluetooth === undefined) nav.bluetooth = { getAvailability: () => Promise.resolve(false) };
  if (nav.serial === undefined) nav.serial = {};
  if (nav.hid === undefined) nav.hid = { getDevices: () => Promise.resolve([]) };
  if (nav.gpu === undefined) nav.gpu = '';
  if (nav.webkitTemporaryStorage === undefined) nav.webkitTemporaryStorage = { queryUsageAndQuota: () => {}, requestQuota: () => {} };
  if (nav.webkitPersistentStorage === undefined) nav.webkitPersistentStorage = { queryUsageAndQuota: () => {}, requestQuota: () => {} };
  if (nav.presentation === undefined) nav.presentation = {};

  // 反检测：__webdriver_* 在 document 上也要显式 undefined
  ['__webdriver_evaluate', '__webdriver_script_function', '__webdriver_script_func', '__webdriver_script_fn',
   '__selenium_evaluate', '__fxdriver_evaluate', '__driver_unwrapped', '__webdriver_unwrapped',
   '__driver_evaluate', '__selenium_unwrapped', '__fxdriver_unwrapped',
   '__webdriver_script_fn', '__nightmare', '_phantom', 'callPhantom', '_selenium', 'webdriver'].forEach(function(p) {
    Object.defineProperty(doc, p, { value: undefined, writable: false, configurable: false });
  });

  // 收集缺失属性
  const missingProps = new Set();

  // 用 Proxy 包装 document
  env2.sandbox.document = new Proxy(doc, {
    get(t, p) {
      if (p === 'cookie') return seedCookie;
      if (p in t) return t[p];
      if (typeof p === 'string' && !p.startsWith('Symbol') && p.length < 60 && p !== 'then') {
        missingProps.add('document.' + p);
      }
      return undefined;
    },
    set(t, p, v) {
      if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true;
      t[p] = v; return true;
    },
    has(t, p) { return true; } // 让 'in' 检查通过
  });

  // 用 Proxy 包装 navigator
  env2.sandbox.navigator = new Proxy(nav, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string' && p.length < 60 && p !== 'then') {
        missingProps.add('navigator.' + p);
      }
      return undefined;
    },
    has(t, p) { return true; }
  });

  // 用 Proxy 包装 screen
  env2.sandbox.screen = new Proxy(env2.sandbox.screen, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string' && p.length < 60 && p !== 'then') {
        missingProps.add('screen.' + p);
      }
      return undefined;
    },
    has(t, p) { return true; }
  });

  // XHR
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  // 补充更多 XHR 属性
  RSXHR2.prototype.UNSENT = 0;
  RSXHR2.prototype.OPENED = 1;
  RSXHR2.prototype.HEADERS_RECEIVED = 2;
  RSXHR2.prototype.LOADING = 3;
  RSXHR2.prototype.DONE = 4;
  env2.sandbox.XMLHttpRequest = RSXHR2;

  // 补全 window 级别缺失的全局对象
  const win = env2.sandbox;
  if (!win.WebSocket) win.WebSocket = function() { this.send = () => {}; this.close = () => {}; this.readyState = 1; this.addEventListener = () => {}; };
  if (!win.Event) win.Event = function() {};
  if (!win.CustomEvent) win.CustomEvent = function() {};
  if (!win.MessageEvent) win.MessageEvent = function() {};
  if (!win.ProgressEvent) win.ProgressEvent = function() {};
  if (!win.ErrorEvent) win.ErrorEvent = function() {};
  if (!win.KeyboardEvent) win.KeyboardEvent = function() {};
  if (!win.MouseEvent) win.MouseEvent = function() {};
  if (!win.PointerEvent) win.PointerEvent = function() {};
  if (!win.TouchEvent) win.TouchEvent = function() {};
  if (!win.WheelEvent) win.WheelEvent = function() {};
  if (!win.AnimationEvent) win.AnimationEvent = function() {};
  if (!win.TransitionEvent) win.TransitionEvent = function() {};
  if (!win.FocusEvent) win.FocusEvent = function() {};
  if (!win.InputEvent) win.InputEvent = function() {};
  if (!win.PopStateEvent) win.PopStateEvent = function() {};
  if (!win.HashChangeEvent) win.HashChangeEvent = function() {};
  if (!win.StorageEvent) win.StorageEvent = function() {};
  if (!win.CloseEvent) win.CloseEvent = function() {};
  if (!win.DeviceOrientationEvent) win.DeviceOrientationEvent = function() {};
  if (!win.DeviceMotionEvent) win.DeviceMotionEvent = function() {};
  if (!win.BeforeUnloadEvent) win.BeforeUnloadEvent = function() {};
  if (!win.PageTransitionEvent) win.PageTransitionEvent = function() {};
  if (!win.UIEvent) win.UIEvent = function() {};
  if (!win.DragEvent) win.DragEvent = function() {};
  if (!win.Audio) win.Audio = function() { this.play = () => {}; this.pause = () => {}; this.load = () => {}; };
  if (!win.Video) win.Video = function() {};
  if (!win.Worker) win.Worker = function() { this.postMessage = () => {}; this.terminate = () => {}; this.addEventListener = () => {}; };
  if (!win.SharedWorker) win.SharedWorker = function() {};
  if (!win.FormData) win.FormData = function() { this.append = () => {}; this.get = () => null; this.has = () => false; };
  if (!win.Headers) win.Headers = function() { this.append = () => {}; this.get = () => null; this.has = () => false; };
  if (!win.Request) win.Request = function() {};
  if (!win.Response) win.Response = function() {};
  if (!win.AbortController) win.AbortController = function() { this.signal = { aborted: false, addEventListener(){} }; this.abort = () => {}; };
  if (!win.AbortSignal) win.AbortSignal = function() {};
  if (!win.ReadableStream) win.ReadableStream = function() {};
  if (!win.WritableStream) win.WritableStream = function() {};
  if (!win.TransformStream) win.TransformStream = function() {};
  if (!win.TextEncoder) win.TextEncoder = function() { this.encode = (s) => Buffer.from(s, 'utf8'); };
  if (!win.TextDecoder) win.TextDecoder = function() { this.decode = (b) => Buffer.from(b).toString('utf8'); };
  if (!win.MessageChannel) win.MessageChannel = function() { this.port1 = { postMessage(){}, start(){}, close(){} }; this.port2 = { postMessage(){}, start(){}, close(){} }; };
  if (!win.MessagePort) win.MessagePort = function() {};
  if (!win.BroadcastChannel) win.BroadcastChannel = function() { this.postMessage = () => {}; this.close = () => {}; this.addEventListener = () => {}; };
  if (!win.OfflineAudioContext) win.OfflineAudioContext = function() { this.startRendering = () => Promise.resolve({}); };
  if (!win.AudioContext) win.AudioContext = function() { this.createOscillator = () => ({ connect(){}, start(){}, stop(){}, frequency:{value:440} }); this.createAnalyser = () => ({ connect(){}, getFloatFrequencyData(){} }); this.createDynamicsCompressor = () => ({ connect(){}, threshold:{value:-24}, knee:{value:30}, ratio:{value:12}, attack:{value:0.003}, release:{value:0.25} }); this.destination = {}; this.sampleRate = 44100; };
  if (!win.webkitAudioContext) win.webkitAudioContext = win.AudioContext;
  if (!win.webkitOfflineAudioContext) win.webkitOfflineAudioContext = win.OfflineAudioContext;
  if (!win.RTCPeerConnection) win.RTCPeerConnection = function() {};
  if (!win.webkitRTCPeerConnection) win.webkitRTCPeerConnection = win.RTCPeerConnection;
  if (!win.CSS) win.CSS = { supports: () => false, escape: (s) => s };
  if (!win.CSSStyleDeclaration) win.CSSStyleDeclaration = function() {};
  if (!win.StyleSheet) win.StyleSheet = function() {};
  if (!win.CSSStyleSheet) win.CSSStyleSheet = function() {};
  if (!win.NamedNodeMap) win.NamedNodeMap = function() {};
  if (!win.Attr) win.Attr = function() {};
  if (!win.Text) win.Text = function() {};
  if (!win.Comment) win.Comment = function() {};
  if (!win.DocumentFragment) win.DocumentFragment = function() {};
  if (!win.ShadowRoot) win.ShadowRoot = function() {};
  if (!win.HTMLDocument) win.HTMLDocument = function() {};
  if (!win.HTMLCollection) win.HTMLCollection = function() {};
  if (!win.NodeList) win.NodeList = function() {};
  if (!win.DOMTokenList) win.DOMTokenList = function() {};
  if (!win.DOMRect) win.DOMRect = function() {};
  if (!win.DOMRectList) win.DOMRectList = function() {};
  if (!win.Range) win.Range = function() {};
  if (!win.TreeWalker) win.TreeWalker = function() {};
  if (!win.NodeFilter) win.NodeFilter = { SHOW_ALL: 0xFFFFFFFF, SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  if (!win.XPathResult) win.XPathResult = {};
  if (!win.CanvasRenderingContext2D) win.CanvasRenderingContext2D = function() {};
  if (!win.CanvasGradient) win.CanvasGradient = function() {};
  if (!win.CanvasPattern) win.CanvasPattern = function() {};
  if (!win.Path2D) win.Path2D = function() {};
  if (!win.ImageData) win.ImageData = function() {};
  if (!win.DataTransfer) win.DataTransfer = function() {};
  if (!win.DataTransferItemList) win.DataTransferItemList = function() {};
  if (!win.DataTransferItem) win.DataTransferItem = function() {};
  if (!win.ClipboardEvent) win.ClipboardEvent = function() {};
  if (!win.GamepadEvent) win.GamepadEvent = function() {};
  if (!win.Gamepad) win.Gamepad = function() {};
  if (!win.Sensor) win.Sensor = function() {};
  if (!win.SensorErrorEvent) win.SensorErrorEvent = function() {};
  if (!win.PerformanceObserver) win.PerformanceObserver = function() { this.observe = () => {}; this.disconnect = () => {}; };
  if (!win.PerformanceEntry) win.PerformanceEntry = function() {};
  if (!win.PerformanceNavigationTiming) win.PerformanceNavigationTiming = function() {};
  if (!win.PerformanceResourceTiming) win.PerformanceResourceTiming = function() {};
  if (!win.PerformanceMark) win.PerformanceMark = function() {};
  if (!win.PerformanceMeasure) win.PerformanceMeasure = function() {};
  if (!win.IntersectionObserver) win.IntersectionObserver = function() { this.observe = () => {}; this.unobserve = () => {}; this.disconnect = () => {}; this.takeRecords = () => []; };
  if (!win.IntersectionObserverEntry) win.IntersectionObserverEntry = function() {};
  if (!win.ResizeObserver) win.ResizeObserver = function() { this.observe = () => {}; this.unobserve = () => {}; this.disconnect = () => {}; };
  if (!win.ReportingObserver) win.ReportingObserver = function() { this.observe = () => {}; this.disconnect = () => {}; };
  if (!win.MutationRecord) win.MutationRecord = function() {};
  if (!win.MutationObserverInit) win.MutationObserverInit = {};
  if (!win.WebGLRenderingContext) win.WebGLRenderingContext = function() {};
  if (!win.WebGL2RenderingContext) win.WebGL2RenderingContext = function() {};
  if (!win.OffscreenCanvas) win.OffscreenCanvas = function() { this.getContext = () => ({}); };
  if (!win.FontFace) win.FontFace = function() { this.load = () => Promise.resolve(this); };
  if (!win.FontFaceSet) win.FontFaceSet = function() {};
  if (!win.Animation) win.Animation = function() {};
  if (!win.KeyframeEffect) win.KeyframeEffect = function() {};
  if (!win.AnimationEffect) win.AnimationEffect = function() {};
  if (!win.AnimationTimeline) win.AnimationTimeline = function() {};
  if (!win.DocumentTimeline) win.DocumentTimeline = function() {};
  if (!win.CSSAnimation) win.CSSAnimation = function() {};
  if (!win.CSSTransition) win.CSSTransition = function() {};
  if (!win.AnimationPlaybackEvent) win.AnimationPlaybackEvent = function() {};
  if (!win.ScrollTimeline) win.ScrollTimeline = function() {};
  if (!win.TrustedHTML) win.TrustedHTML = function() {};
  if (!win.TrustedScript) win.TrustedScript = function() {};
  if (!win.TrustedScriptURL) win.TrustedScriptURL = function() {};
  if (!win.TrustedTypePolicy) win.TrustedTypePolicy = function() {};
  if (!win.trustedTypes) win.trustedTypes = { createPolicy: () => ({ createHTML:(s)=>s, createScript:(s)=>s, createScriptURL:(s)=>s }) };
  if (!win.requestIdleCallback) win.requestIdleCallback = (fn) => { try { fn({ didTimeout: false, timeRemaining: () => 50 }); } catch(e) {} return 0; };
  if (!win.cancelIdleCallback) win.cancelIdleCallback = () => {};
  if (!win.fetch) win.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(''), headers: { get: () => null } });
  if (!win.Headers) win.Headers = function() { this.append = () => {}; this.get = () => null; };
  if (!win.alert) win.alert = () => {};
  if (!win.confirm) win.confirm = () => false;
  if (!win.prompt) win.prompt = () => null;
  if (!win.print) win.print = () => {};
  if (!win.scroll) win.scroll = () => {};
  if (!win.scrollTo) win.scrollTo = () => {};
  if (!win.scrollBy) win.scrollBy = () => {};
  if (!win.open) win.open = () => null;
  if (!win.close) win.close = () => {};
  if (!win.stop) win.stop = () => {};
  if (!win.focus) win.focus = () => {};
  if (!win.blur) win.blur = () => {};
  if (!win.postMessage) win.postMessage = () => {};
  if (!win.getComputedStyle) win.getComputedStyle = () => new Proxy({}, { get: (t, p) => (p === 'getPropertyValue' ? () => '' : p === 'length' ? 0 : '') });
  if (!win.getSelection) win.getSelection = () => ({ rangeCount: 0, toString: () => '', removeAllRanges: () => {}, addRange: () => {} });
  if (!win.matchMedia) win.matchMedia = () => ({ matches: false, media: '', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, onchange: null });
  if (!win.customElements) win.customElements = { define: () => {}, get: () => undefined, whenDefined: () => Promise.resolve(), upgrade: () => {} };
  if (!win.caches) win.caches = { open: () => Promise.resolve({ match: () => Promise.resolve(undefined) }) };
  if (!win.cookieStore) win.cookieStore = { get: () => Promise.resolve(null), getAll: () => Promise.resolve([]), set: () => Promise.resolve(), delete: () => Promise.resolve() };
  if (win.crossOriginIsolated === undefined) win.crossOriginIsolated = false;
  if (win.isSecureContext === undefined) win.isSecureContext = true;
  if (!win.origin) win.origin = 'https://pmos.xj.sgcc.com.cn:20080';
  if (!win.name) win.name = '';
  if (!win.status) win.status = '';
  if (!win.closed) win.closed = false;
  if (!win.length) win.length = 0;
  if (win.event === undefined) win.event = undefined;
  if (!win.chrome) win.chrome = { app: { isInstalled: false }, runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

  // 执行 patched 动态代码
  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, patched); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 清空 catch log
  vm.runInContext('window.__ce = []', env2.proxied);

  // 触发 trampoline
  console.log('\n[Step 1] 触发 trampoline...');
  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  if (!tramp) {
    console.log('No trampoline found on XHR!');
    // 检查 RS 是否 hook 了 XHR
    console.log('XHR keys:', Object.keys(xhr).filter(k => k.startsWith('_$')).join(', '));
  }

  if (tramp) {
    let result;
    try {
      result = tramp.call(xhr, '{}');
    } catch(e) {
      console.log('Trampoline threw:', e.message);
      result = '';
    }
    console.log('Result: "' + String(result).substring(0, 80) + '"');
    console.log('Result type:', typeof result);
    console.log('Result length:', typeof result === 'string' ? result.length : 'N/A');

    // 检查 catch logs
    const catches = vm.runInContext('window.__ce || []', env2.proxied);
    console.log('\n=== Catches: ' + catches.length + ' ===');
    const uniqueMsgs = [...new Set(catches.map(c => c.msg))];
    uniqueMsgs.forEach(function(msg, i) {
      const count = catches.filter(c => c.msg === msg).length;
      console.log('  [' + i + '] (x' + count + ') ' + msg);
      // 打印第一个匹配的 stack
      const first = catches.find(c => c.msg === msg);
      if (first && first.stack) console.log('       stack: ' + first.stack.substring(0, 200));
    });

    // 检查缺失属性
    console.log('\n=== Missing properties ===');
    console.log('Count:', missingProps.size);
    [...missingProps].sort().forEach(p => console.log('  ' + p));

    // 如果有 query，保存
    if (result && typeof result === 'string' && result.length > 10) {
      console.log('\n*** QUERY CAPTURED! ***');
      console.log('Query:', result);
      fs.writeFileSync(
        path.join(ROOT, 'output/capture-20080/query-captured.json'),
        JSON.stringify({ query: result, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
      );
      console.log('Saved to output/capture-20080/query-captured.json');
    }

    // 如果还有异常，分析并输出修复建议
    if (catches.length > 0 && (!result || result.length < 10)) {
      console.log('\n=== 异常修复建议 ===');
      uniqueMsgs.forEach(function(msg) {
        if (msg.includes('charAt')) {
          console.log('charAt: 某个值是 null/undefined 被当字符串用');
          console.log('  → 检查 DOM 方法返回值，确保不返回 null（改返回 "" 或空对象）');
        } else if (msg.includes('is not a function')) {
          console.log('is not a function: 某个属性应该是函数但不是');
          console.log('  → 检查缺失属性列表，补全为函数');
        } else if (msg.includes('length')) {
          console.log('length: undefined.length 被访问');
          console.log('  → 某个 API 返回 undefined，应该返回数组或字符串');
        } else if (msg.includes('call')) {
          console.log('call: undefined.call() 被调用');
          console.log('  → 某个函数引用是 undefined');
        }
      });

      // 输出缺失属性到文件
      fs.writeFileSync(
        path.join(ROOT, 'output/capture-20080/missing-props.json'),
        JSON.stringify({
          missing: [...missingProps].sort(),
          catches: catches,
          timestamp: new Date().toISOString()
        }, null, 2)
      );
      console.log('\nMissing props saved to output/capture-20080/missing-props.json');
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
