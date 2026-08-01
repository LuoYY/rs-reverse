/**
 * 93_quickjs_sandbox.js
 * 用 quickjs-emscripten（非 V8 引擎）跑 nx 外层 VM —— 验证 _$ml 大函数 return 是否正常
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  const { getQuickJS } = require('quickjs-emscripten');
  const QJ = await getQuickJS();
  console.log('QuickJS 版本:', QJ.version);

  // 用最新 sync 会话的 nsd/cd（可用 SYNC_FILE 指定固定文件，与 V8 采集同一 challenge）
  const syncFile = process.env.SYNC_FILE || fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  console.log('nsd:', nsd, 'cdLen:', cd.length, 'sync:', syncFile);

  const vm = QJ.newContext();
  // sp：自动转换原始值为 handle（quickjs setProp 传原始值会得到 0/空！）
  const sp = (obj, name, val) => {
    let h;
    if (typeof val === 'string') h = vm.newString(val);
    else if (typeof val === 'number') h = vm.newNumber(val);
    else if (typeof val === 'boolean') { const r = vm.evalCode(val ? 'true' : 'false'); h = r.value; }
    else h = val;
    vm['setProp'](obj, name, h);
    return h;
  };
  try {
    // ============ 构建浏览器环境 ============
    const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
    const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

    // cookie 捕获（宿主）
    let cookiesStr = '';
    let seg = 'start';
    const log = () => console.log('  [env]', seg, 'OK');

    // document 对象
    const doc = vm.newObject();
    seg = 'document';
    const mkEl = () => {
      const el = vm.newObject();
      sp(el, 'style', vm.newObject());
      sp(el, 'dataset', vm.newObject());
      sp(el, 'getContext', vm.newFunction('getContext', () => null));
      sp(el, 'toDataURL', vm.newFunction('toDataURL', () => 'data:image/png;base64,iVBORw0KGgo='));
      sp(el, 'setAttribute', vm.newFunction('setAttribute', () => undefined));
      sp(el, 'getAttribute', vm.newFunction('getAttribute', () => null));
      sp(el, 'appendChild', vm.newFunction('appendChild', (c) => c));
      sp(el, 'removeChild', vm.newFunction('removeChild', () => undefined));
      sp(el, 'addEventListener', vm.newFunction('addEventListener', () => undefined));
      sp(el, 'removeEventListener', vm.newFunction('removeEventListener', () => undefined));
      return el;
    };
    sp(doc, 'createElement', vm.newFunction('createElement', () => mkEl()));
    sp(doc, 'createElementNS', vm.newFunction('createElementNS', () => mkEl()));
    sp(doc, 'getElementsByTagName', vm.newFunction('getElementsByTagName', () => vm.newArray()));
    sp(doc, 'getElementById', vm.newFunction('getElementById', () => null));
    sp(doc, 'querySelector', vm.newFunction('querySelector', () => null));
    sp(doc, 'querySelectorAll', vm.newFunction('querySelectorAll', () => vm.newArray()));
    sp(doc, 'getElementsByName', vm.newFunction('getElementsByName', () => vm.newArray()));
    sp(doc, 'getElementsByClassName', vm.newFunction('getElementsByClassName', () => vm.newArray()));
    sp(doc, 'addEventListener', vm.newFunction('addEventListener', () => undefined));
    sp(doc, 'removeEventListener', vm.newFunction('removeEventListener', () => undefined));
    sp(doc, 'documentElement', mkEl());
    sp(doc, 'body', mkEl());
    sp(doc, 'head', mkEl());
    sp(doc, 'readyState', 'complete');
    sp(doc, 'compatMode', 'CSS1Compat');
    sp(doc, 'referrer', TARGET);
    sp(doc, 'title', '');
    sp(doc, 'domain', 'pmos.nx.sgcc.com.cn');
    sp(doc, 'URL', TARGET);
    sp(doc, 'documentURI', TARGET);
    sp(doc, 'hidden', false);
    sp(doc, 'visibilityState', 'visible');
    sp(doc, 'defaultView', vm.undefined); // window 设置后回填
    // document.all（IE 兼容检测，Chrome 存在但 truthy 特殊对象）
    const docAll = vm.newObject();
    sp(docAll, 'length', 0);
    sp(doc, 'all', docAll);
    // implementation.hasFeature（瑞数检测）
    const impl = vm.newObject();
    sp(impl, 'hasFeature', vm.newFunction('hasFeature', () => true));
    sp(doc, 'implementation', impl);
    sp(doc, 'documentMode', vm.undefined);
    sp(doc, 'currentScript', mkEl());
    sp(doc, 'characterSet', 'UTF-8');
    sp(doc, 'charset', 'UTF-8');
    sp(doc, 'inputEncoding', 'UTF-8');
    sp(doc, 'lastModified', new Date().toString());
    sp(doc, 'activeElement', mkEl());
    sp(doc, 'onreadystatechange', vm.undefined);
    sp(doc, 'visibilityState', 'visible');
    // cookie（宿主捕获——用函数 getter/setter）
    const cookieGet = vm.newFunction('cookieGet', () => vm.newString(cookiesStr));
    const cookieSet = vm.newFunction('cookieSet', (v) => { cookiesStr = (cookiesStr ? cookiesStr + '; ' : '') + vm.dump(v); return vm.undefined; });
    sp(doc, 'cookie', vm.newString(cookiesStr));

    // navigator
    const nav = vm.newObject();
    sp(nav, 'userAgent', UA);
    sp(nav, 'platform', 'MacIntel');
    sp(nav, 'maxTouchPoints', 0);
    sp(nav, 'appName', 'Netscape');
    sp(nav, 'appCodeName', 'Mozilla');
    sp(nav, 'product', 'Gecko');
    sp(nav, 'productSub', '20030107');
    sp(nav, 'vendor', 'Google Inc.');
    sp(nav, 'vendorSub', '');
    sp(nav, 'language', 'zh-CN');
    sp(nav, 'languages', vm.newArray());
    sp(nav, 'cookieEnabled', true);
    sp(nav, 'hardwareConcurrency', 8);
    sp(nav, 'deviceMemory', 8);
    sp(nav, 'onLine', true);
    sp(nav, 'doNotTrack', vm.undefined);
    sp(nav, 'webdriver', false);
    sp(nav, 'javaEnabled', vm.newFunction('javaEnabled', () => false));
    sp(nav, 'sendBeacon', vm.newFunction('sendBeacon', () => true));
    const plugins = vm.newArray();
    sp(nav, 'plugins', plugins);
    sp(nav, 'mimeTypes', vm.newArray());
    const conn = vm.newObject();
    sp(conn, 'effectiveType', '4g');
    sp(nav, 'connection', conn);

    // location
    const loc = vm.newObject();
    sp(loc, 'href', TARGET);
    sp(loc, 'pathname', '/');
    sp(loc, 'hostname', 'pmos.nx.sgcc.com.cn');
    sp(loc, 'protocol', 'https:');
    sp(loc, 'host', 'pmos.nx.sgcc.com.cn:10443');
    sp(loc, 'origin', 'https://pmos.nx.sgcc.com.cn:10443');
    sp(loc, 'port', '10443');
    sp(loc, 'search', '');
    sp(loc, 'hash', '');
    sp(loc, 'reload', vm.newFunction('reload', () => undefined));
    sp(loc, 'replace', vm.newFunction('replace', () => undefined));
    sp(loc, 'assign', vm.newFunction('assign', () => undefined));
    sp(loc, 'toString', vm.newFunction('toString', () => TARGET));

    // screen
    const scr = vm.newObject();
    sp(scr, 'width', 1680);
    sp(scr, 'height', 1050);
    sp(scr, 'availWidth', 1680);
    sp(scr, 'availHeight', 1025);
    sp(scr, 'colorDepth', 24);
    sp(scr, 'pixelDepth', 24);
    sp(scr, 'availLeft', 0);
    sp(scr, 'availTop', 0);

    // performance
    const perf = vm.newObject();
    sp(perf, 'now', vm.newFunction('now', () => Date.now()));
    sp(perf, 'timing', vm.newObject());

    // window 对象（全局）
    const win = vm.newObject();
    sp(win, 'document', doc);
    sp(win, 'navigator', nav);
    sp(win, 'location', loc);
    sp(win, 'screen', scr);
    sp(win, 'performance', perf);
    sp(win, 'name', '');
    sp(win, 'innerWidth', 1680);
    sp(win, 'innerHeight', 1050);
    sp(win, 'outerWidth', 1680);
    sp(win, 'outerHeight', 1050);
    sp(win, 'devicePixelRatio', 2);
    sp(win, 'screenX', 0);
    sp(win, 'screenY', 0);
    sp(win, 'pageXOffset', 0);
    sp(win, 'pageYOffset', 0);
    sp(win, 'scrollX', 0);
    sp(win, 'scrollY', 0);
    sp(win, 'top', win);
    sp(win, 'parent', win);
    sp(win, 'self', win);
    sp(win, 'frames', win);
    sp(win, 'opener', vm.undefined);
    sp(win, 'closed', false);
    sp(win, 'length', 0);
    sp(win, 'origin', 'https://pmos.nx.sgcc.com.cn:10443');
    sp(win, 'crossOriginIsolated', false);
    sp(win, 'isSecureContext', true);
    sp(win, 'addEventListener', vm.newFunction('addEventListener', () => undefined));
    sp(win, 'removeEventListener', vm.newFunction('removeEventListener', () => undefined));
    sp(win, 'postMessage', vm.newFunction('postMessage', () => undefined));
    sp(win, 'atob', vm.newFunction('atob', (s) => Buffer.from(vm.dump(s), 'base64').toString('binary')));
    sp(win, 'btoa', vm.newFunction('btoa', (s) => Buffer.from(vm.dump(s), 'binary').toString('base64')));
    // 定时器：fn 是 quickjs handle，必须用 vm.callFunction 调用
    const callFn = (fn) => { try { const v = vm.dump(fn); if (typeof v === 'number') return false; vm.callFunction(fn); return true; } catch (e) { return false; } };
    sp(win, 'setTimeout', vm.newFunction('setTimeout', (fn, ms) => { callFn(fn); return 0; }));
    sp(win, 'clearTimeout', vm.newFunction('clearTimeout', () => undefined));
    sp(win, 'setInterval', vm.newFunction('setInterval', (fn) => { callFn(fn); return 0; }));
    sp(win, 'clearInterval', vm.newFunction('clearInterval', () => undefined));
    sp(win, 'requestAnimationFrame', vm.newFunction('requestAnimationFrame', (fn) => { callFn(fn); return 0; }));
    sp(win, 'cancelAnimationFrame', vm.newFunction('cancelAnimationFrame', () => undefined));
    sp(win, 'queueMicrotask', vm.newFunction('queueMicrotask', (fn) => { callFn(fn); }));
    sp(win, 'getComputedStyle', vm.newFunction('getComputedStyle', () => { const s = vm.newObject(); return s; }));
    sp(win, 'matchMedia', vm.newFunction('matchMedia', () => { const m = vm.newObject(); sp(m, 'matches', false); return m; }));
    sp(win, 'devicePixelRatio', 2);
    // $_ts（挑战页 HTML 定义的全局，外层 JS 引用）
    const ts = vm.newObject();
    sp(ts, 'nsd', nsd);
    sp(ts, 'cd', cd);
    sp(win, '$_ts', ts);
    sp(vm.global, '$_ts', ts);
    // ★★ 注入 V8 导出的 aebi / cp（外层 JS 在 quickjs 里未填充 → 动态代码 _$fW undefined / cp undefined）
    try {
      const l5f = path.join(OUT, 'l5_from_v8.json');
      if (fs.existsSync(l5f)) {
        const v8d = JSON.parse(fs.readFileSync(l5f, 'utf8'));
        if (v8d.aebi && Array.isArray(v8d.aebi)) {
          const r = vm.evalCode('var __aebi=' + JSON.stringify(v8d.aebi) + ';');
          const aebiH = vm.getProp(vm.global, '__aebi');
          sp(ts, 'aebi', aebiH);
          console.log('已注入 $_ts.aebi（', v8d.aebi.length, '元素）');
        }
        if (v8d.cp && Array.isArray(v8d.cp)) {
          const r2 = vm.evalCode('var __cp=' + JSON.stringify(v8d.cp) + ';');
          const cpH = vm.getProp(vm.global, '__cp');
          sp(ts, 'cp', cpH);
          console.log('已注入 $_ts.cp（', v8d.cp.length, '元素）');
        }
      }
    } catch (e) { console.log('注入 aebi/cp 失败:', String(e).substring(0, 60)); }

    // 全局对象设置
    sp(vm.global, 'window', win);
    sp(vm.global, 'self', win);
    sp(vm.global, 'top', win);
    sp(vm.global, 'parent', win);
    sp(vm.global, 'frames', win);
    sp(vm.global, 'globalThis', win);
    sp(vm.global, 'document', doc);
    sp(vm.global, 'navigator', nav);
    sp(vm.global, 'location', loc);
    sp(vm.global, 'screen', scr);
    sp(vm.global, 'performance', perf);
    // XHR stub（同步 200 空响应，瑞数请求路径）
    sp(vm.global, 'XMLHttpRequest', vm.newFunction('XMLHttpRequest', function () {
      const x = vm.newObject();
      sp(x, 'readyState', 4);
      sp(x, 'status', 200);
      sp(x, 'statusText', 'OK');
      sp(x, 'responseText', '');
      sp(x, 'response', vm.undefined);
      sp(x, 'responseType', '');
      sp(x, 'withCredentials', false);
      sp(x, 'timeout', 0);
      sp(x, 'onreadystatechange', vm.undefined);
      sp(x, 'onload', vm.undefined);
      sp(x, 'onerror', vm.undefined);
      sp(x, 'onabort', vm.undefined);
      sp(x, 'setRequestHeader', vm.newFunction('setRequestHeader', () => undefined));
      sp(x, 'open', vm.newFunction('open', () => undefined));
      sp(x, 'send', vm.newFunction('send', () => {
        try { const oc = vm.getProp(x, 'onreadystatechange'); vm.callFunction(oc); } catch (e) {}
        try { const ol = vm.getProp(x, 'onload'); vm.callFunction(ol); } catch (e) {}
        return undefined;
      }));
      sp(x, 'abort', vm.newFunction('abort', () => undefined));
      sp(x, 'getAllResponseHeaders', vm.newFunction('getAllResponseHeaders', () => ''));
      sp(x, 'getResponseHeader', vm.newFunction('getResponseHeader', () => null));
      return x;
    }));
    // fetch：返回真实 Promise（200 空响应）——外层 JS 异步链依赖
    sp(vm.global, 'fetch', vm.newFunction('fetch', () => {
      const p = vm.newPromise();
      const resp = vm.newObject();
      sp(resp, 'ok', true);
      sp(resp, 'status', 200);
      sp(resp, 'statusText', 'OK');
      sp(resp, 'url', TARGET);
      sp(resp, 'text', vm.newFunction('text', () => {
        const p2 = vm.newPromise(); p2.resolve(vm.newString('')); return p2.handle;
      }));
      sp(resp, 'json', vm.newFunction('json', () => {
        const p2 = vm.newPromise(); p2.resolve(vm.newObject()); return p2.handle;
      }));
      sp(resp, 'arrayBuffer', vm.newFunction('arrayBuffer', () => {
        const p2 = vm.newPromise(); p2.resolve(vm.newArrayBuffer ? vm.newArrayBuffer(0) : vm.undefined); return p2.handle;
      }));
      const hdrs = vm.newObject();
      sp(hdrs, 'get', vm.newFunction('get', () => null));
      sp(resp, 'headers', hdrs);
      p.resolve(resp);
      return p.handle;
    }));
    sp(vm.global, 'WebSocket', vm.newFunction('WebSocket', function () {}));
    sp(vm.global, 'Image', vm.newFunction('Image', () => mkEl()));
    sp(vm.global, 'Option', vm.newFunction('Option', () => mkEl()));
    sp(vm.global, 'Audio', vm.newFunction('Audio', () => mkEl()));
    sp(vm.global, 'Event', vm.newFunction('Event', function () {}));
    sp(vm.global, 'CustomEvent', vm.newFunction('CustomEvent', function () {}));
    sp(vm.global, 'MouseEvent', vm.newFunction('MouseEvent', function () {}));
    sp(vm.global, 'KeyboardEvent', vm.newFunction('KeyboardEvent', function () {}));
    sp(vm.global, 'HTMLElement', vm.newFunction('HTMLElement', function () {}));
    sp(vm.global, 'HTMLCanvasElement', vm.newFunction('HTMLCanvasElement', function () {}));
    sp(vm.global, 'TextEncoder', vm.newFunction('TextEncoder', function () {}));
    sp(vm.global, 'TextDecoder', vm.newFunction('TextDecoder', function () {}));
    sp(vm.global, 'ResizeObserver', vm.newFunction('ResizeObserver', function () {}));
    sp(vm.global, 'IntersectionObserver', vm.newFunction('IntersectionObserver', function () {}));
    sp(vm.global, 'Worker', vm.newFunction('Worker', function () {}));
    sp(vm.global, 'localStorage', vm.newObject());
    sp(vm.global, 'sessionStorage', vm.newObject());
    sp(vm.global, 'caches', vm.newObject());
    sp(vm.global, 'indexedDB', vm.newObject());
    sp(vm.global, 'name', '');

    // ============ 跑外层 VM ============
    // 设 console（quickjs 无）
    try {
      vm.evalCode(`
        var console = { log: function(){}, error: function(){}, warn: function(){} };
        window.console = console;
      `);
    } catch (e) {}
    // 测 eval 原生性（瑞数检测点）
    try {
      const t2 = vm.evalCode('Function.prototype.toString.call(eval)', 'test2.js');
      console.log('eval.toString:', t2.error ? 'ERR' : vm.dump(t2.value));
    } catch (e) { console.log('eval toString 异常:', String(e).substring(0, 80)); }
    // Proxy eval 捕获动态代码（quickjs 支持 Proxy）
    try {
      vm.evalCode(`
        var __nativeEval = eval;
        var __captured = [];
        var __capturedLen = [];
        var __dynCount = 0;
        eval = new Proxy(__nativeEval, {
          apply: function(t, th, args) {
            try {
              if (typeof args[0] !== 'string') {
                window.__evalBad = { type: typeof args[0], stack: new Error().stack ? String(new Error().stack).substring(0, 800) : 'no-stack' };
                return undefined;
              }
              if (String(args[0]).indexOf('undefined') >= 0) {
                window.__evalUndef = { body: String(args[0]).substring(0, 300), stack: new Error().stack ? String(new Error().stack).substring(0, 500) : 'no-stack' };
              }
              var c = String(args[0]);
              __capturedLen.push(c.length);
              if (c.length > 10000) {
                __dynCount++;
                __captured.push(c.substring(0, 200));
                // ★★ 每次迭代强制覆盖 V8 检测变量 + _$l5 + 工具函数（_$cz 解码依赖 _$$2/_$eD）
                // 关键：一次性注入会被 op270/op334 等写 _$l5[N] 覆盖 → 必须每轮重注入
                c = c.replace('while(1){_$k7=_$pb[_$ne++];', 'while(1){if(!window.__vv){window.__vv=JSON.parse(window.__v8v);}if(!_$$2)_$$2=String.fromCharCode;if(!_$eD)_$eD=Array;_$_r=window.__vv.r;_$aW=window.__vv.aW;_$mM=window.__vv.mM;_$ak=window.__vv.ak;_$bt=window.__vv.bt;_$aQ=window.__vv.aQ;_$oM=window.__vv.oM;_$ic=window.__vv.ic;_$ln=window.__vv.ln;_$eG=window.__vv.eG;_$ng=window.__vv.ng;_$l5=window.__vv.l5;_$k7=_$pb[_$ne++];');
                // _$cz 插桩：记录输入类型（定位 eval 参数 undefined 来源）
                c = c.replace('function _$cz(_$_7){var _$kX,_$_d,_$k3,_$aR,_$cb,_$lP;', 'function _$cz(_$_7){window.__czLog=(window.__czLog||[]);window.__czLog.push((typeof _$_7)+":"+String(_$_7).substring(0,40));if(window.__czLog.length>120)window.__czLog.shift();var _$kX,_$_d,_$k3,_$aR,_$cb,_$lP;');
                window.__dynCode = c;
                args[0] = c;
              }
            } catch(e2) {}
            return Reflect.apply(t, th, args);
          }
        });
        window.__evalInfo = { count: 0, lens: __capturedLen, samples: __captured };
      `);
      // window.eval 同步为 Proxy（外层 JS 可能用 window.eval）
      const evalProxyH = vm.getProp(vm.global, 'eval');
      sp(win, 'eval', evalProxyH);
      // __mkIn：_$in Proxy 包装（记录缺失属性，定位 quickjs 环境差异）
      try {
        vm.evalCode(`
          var __inLog = [];
          window.__mkIn = function(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            try {
              return new Proxy(obj, {
                get: function(t, p) {
                  var v = t[p];
                  if (typeof v === 'undefined' && typeof p === 'string') {
                    __inLog.push(String(p));
                    if (__inLog.length > 40) __inLog.shift();
                  }
                  return v;
                }
              });
            } catch(e4) { return obj; }
          };
          window.__getInLog = function(){ return __inLog.join(','); };
          // __mkWin：_$e$ Proxy 包装（记录 quickjs window 缺失属性——_$g7 检测链根）
          window.__winMiss = [];
          window.__mkWin = function() {
            try {
              return new Proxy(globalThis, {
                get: function(t, p) {
                  var v = t[p];
                  if (typeof v === 'undefined' && typeof p === 'string') {
                    window.__winMiss.push(String(p));
                    if (window.__winMiss.length > 40) window.__winMiss.shift();
                  }
                  return v;
                }
              });
            } catch(e5) { return globalThis; }
          };
        `);
        console.log('__mkIn/__mkWin 已安装');
      } catch (e) { console.log('__mkIn 失败:', String(e).substring(0, 60)); }
      // Function 构造 hook（外层 JS 可能用 Function 生成动态代码）
      vm.evalCode(`
        var __nativeFunction = Function;
        Function = function() {
          try {
            var s = [].slice.call(arguments, 0, arguments.length - 1).join(',');
            var body = arguments[arguments.length - 1];
            if (typeof body !== 'string') {
              window.__fnBad = { type: typeof body, stack: new Error().stack ? String(new Error().stack).substring(0, 800) : 'no-stack' };
            } else if (String(body).indexOf('undefined') >= 0) {
              window.__fnUndef = { body: String(body).substring(0, 300), stack: new Error().stack ? String(new Error().stack).substring(0, 500) : 'no-stack' };
            }
            __capturedLen.push(String(body).length);
            if (String(body).length > 10000) __captured.push(String(body).substring(0, 200));
          } catch(e2) {}
          return __nativeFunction.apply(this, arguments);
        };
        Function.prototype = __nativeFunction.prototype;
      `);
      console.log('Proxy eval + Function hook 已安装');
      // ===== 环境补全（对照 V8 buildEnv）=====
      try {
        vm.evalCode(`
          // Z8XHJJY 万能容错 Proxy（瑞数反检测探针调用）
          var Z8XHJJY = new Proxy({}, { get: function(t, p) { return typeof p === 'string' ? function(){ return {}; } : undefined; } });
          window.Z8XHJJY = Z8XHJJY;
          // chrome（真实存在）
          var chrome = { app: {}, runtime: {}, loadTimes: function(){ return {}; }, csi: function(){ return {}; } };
          window.chrome = chrome;
          // 自动化工具特征显式 undefined
          window.callPhantom = undefined; window._phantom = undefined; window.spawn = undefined;
          window.emit = undefined; window.Buffer = undefined; window.domAutomation = undefined;
          window.domAutomationController = undefined; window.__nightmare = undefined;
          window.__webdriver_evaluate = undefined; window.__selenium_evaluate = undefined;
          window.__webdriver_script_function = undefined; window.__webdriver_script_fn = undefined;
          window.__driver_evaluate = undefined; window.__webdriver_unwrapped = undefined;
          window.__selenium_unwrapped = undefined; window.__fxdriver_unwrapped = undefined;
          // history / storage
          window.history = { pushState: function(){}, replaceState: function(){}, back: function(){}, forward: function(){}, go: function(){}, length: 1, state: null };
          window.localStorage = { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){}, clear: function(){}, length: 0, key: function(){ return null; } };
          window.sessionStorage = { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){}, clear: function(){}, length: 0, key: function(){ return null; } };
          // misc
          window.getSelection = function(){ return { rangeCount: 0, toString: function(){ return ''; } }; };
          window.dispatchEvent = function(){ return true; };
          window.Blob = function(){}; window.FileReader = function(){ this.readAsText = function(){}; this.readAsDataURL = function(){}; };
          window.DOMParser = function(){ this.parseFromString = function(){ return document; }; };
          window.MutationObserver = function(){ this.observe = function(){}; this.disconnect = function(){}; };
          window.HTMLElement = function(){}; window.Element = function(){}; window.Node = function(){};
          if (typeof URL === 'undefined') {
            function URL(u, b) { this.href = String(u); this.protocol = ''; this.hostname = ''; this.pathname = ''; this.search = ''; this.hash = ''; this.toString = function(){ return this.href; }; }
            URL.createObjectURL = function(){ return 'blob:'; }; URL.revokeObjectURL = function(){};
            window.URL = URL;
          }
          if (typeof URLSearchParams === 'undefined') {
            function URLSearchParams(q) { this.toString = function(){ return String(q || ''); }; this.get = function(){ return null; }; this.getAll = function(){ return []; }; }
            window.URLSearchParams = URLSearchParams;
          }
          window.__envReady = true;
        `);
        console.log('环境补全完成');
      } catch (e) { console.log('环境补全失败:', String(e).substring(0, 80)); }
      // crypto（需要宿主函数，vm 内建无 getRandomValues）
      try {
        const cryptoObj = vm.newObject();
        sp(cryptoObj, 'getRandomValues', vm.newFunction('getRandomValues', (arr) => {
          try {
            const n = vm.dump(vm.getProp(arr, 'length'));
            for (let i = 0; i < n; i++) sp(arr, i, vm.newNumber(Math.floor(Math.random() * 256)));
          } catch (e) {}
          return arr;
        }));
        sp(cryptoObj, 'subtle', vm.newObject());
        sp(vm.global, 'crypto', cryptoObj);
        sp(win, 'crypto', cryptoObj);
        console.log('crypto 已设置');
      } catch (e) { console.log('crypto 失败:', String(e).substring(0, 60)); }
      // ★★ 关键：window 必须与全局作用域一致（瑞数检测 var x 与 window.x 一致性）
      // 复制 win 关键属性到 vm.global，然后 window = globalThis
      try {
        const winKeys = ['document', 'navigator', 'location', 'screen', 'performance', 'name', 'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio', 'screenX', 'screenY', 'pageXOffset', 'pageYOffset', 'scrollX', 'scrollY', 'addEventListener', 'removeEventListener', 'postMessage', 'atob', 'btoa', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'getComputedStyle', 'matchMedia', 'eval', 'crypto', 'history', 'localStorage', 'sessionStorage', 'getSelection', 'dispatchEvent', 'Blob', 'FileReader', 'DOMParser', 'MutationObserver', 'HTMLElement', 'Element', 'Node', 'URL', 'URLSearchParams', 'Z8XHJJY', 'chrome'];
        for (const p of winKeys) {
          try {
            const h = vm.getProp(win, p);
            if (h !== vm.undefined) sp(vm.global, p, h);
          } catch (e2) {}
        }
        vm.evalCode('window = globalThis; self = globalThis; top = globalThis; parent = globalThis; frames = globalThis;');
        // ★★ 环境值对齐 V8 buildEnv（已验证 _$g7 通过）——补齐 quickjs 差异项
        try {
          vm.evalCode(`
            // navigator 对齐 V8 buildEnv
            navigator.userAgent = "${UA}";
            navigator.platform = 'MacIntel';
            navigator.maxTouchPoints = 0;
            navigator.appName = 'Netscape';
            navigator.appVersion = '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
            navigator.appCodeName = 'Mozilla';
            navigator.product = 'Gecko';
            navigator.productSub = '20030107';
            navigator.vendor = 'Google Inc.';
            navigator.vendorSub = '';
            navigator.language = 'zh-CN';
            navigator.languages = ['zh-CN', 'zh'];
            navigator.cookieEnabled = true;
            navigator.hardwareConcurrency = 8;
            navigator.deviceMemory = 8;
            navigator.onLine = true;
            navigator.webdriver = false;
            navigator.plugins = { length: 5, item: function(){ return null; }, namedItem: function(){ return null; }, refresh: function(){} };
            navigator.mimeTypes = { length: 2, item: function(){ return null; }, namedItem: function(){ return null; } };
            navigator.javaEnabled = function(){ return false; };
            navigator.sendBeacon = function(){ return true; };
            navigator.getBattery = function(){ return Promise.resolve({ charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1, addEventListener: function(){} }); };
            navigator.permissions = { query: function(){ return Promise.resolve({ state: 'prompt' }); } };
            navigator.mediaDevices = { enumerateDevices: function(){ return Promise.resolve([]); } };
            navigator.connection = { effectiveType: '4g', rtt: 50, downlink: 10 };
            navigator.ink = undefined; navigator.scheduling = undefined;
            // screen 对齐
            screen.width = 1680; screen.height = 1050;
            screen.availWidth = 1680; screen.availHeight = 1025;
            screen.colorDepth = 24; screen.pixelDepth = 24;
            screen.availLeft = 0; screen.availTop = 0;
            screen.orientation = { angle: 0, type: 'landscape-primary' };
            screenLeft = 0; screenTop = 0;
            // document 对齐
            document.characterSet = 'UTF-8'; document.charset = 'UTF-8'; document.inputEncoding = 'UTF-8';
            document.fonts = { check: function(){ return true; }, forEach: function(){}, values: function(){ return []; } };
            document.hidden = false; document.visibilityState = 'visible'; document.readyState = 'complete';
            document.compatMode = 'CSS1Compat'; document.documentMode = undefined;
            document.domain = 'pmos.nx.sgcc.com.cn';
            document.documentURI = "${TARGET}"; document.URL = "${TARGET}";
            document.referrer = ''; document.title = '';
            document.location = location;
            document.all = { length: 0, item: function(){ return null; }, namedItem: function(){ return null; } };
            document.implementation = { createHTMLDocument: function(){ return document; }, hasFeature: function(){ return true; } };
            // location 对齐
            location.ancestorOrigins = { length: 0 };
            location.origin = 'https://pmos.nx.sgcc.com.cn:10443';
            // performance 对齐
            performance.now = function(){ return Date.now(); };
            performance.timeOrigin = Date.now();
            performance.timing = { navigationStart: Date.now() };
            performance.memory = { jsHeapSizeLimit: 2330000000, totalJSHeapSize: 10000000, usedJSHeapSize: 5000000 };
            performance.getEntries = function(){ return []; };
            performance.getEntriesByType = function(){ return []; };
            performance.mark = function(){}; performance.measure = function(){};
            // history 对齐
            history.length = 1; history.state = null;
            // misc 对齐
            window.status = ''; window.name = '';
            window.innerWidth = 1680; window.innerHeight = 938;
            window.outerWidth = 1680; window.outerHeight = 1025;
            window.devicePixelRatio = 2;
            window.screenX = 0; window.screenY = 0; window.screenLeft = 0; window.screenTop = 0;
            window.pageXOffset = 0; window.pageYOffset = 0; window.scrollX = 0; window.scrollY = 0;
            window.getSelection = function(){ return { rangeCount: 0, toString: function(){ return ''; } }; };
            window.dispatchEvent = function(){ return true; };
            window.getComputedStyle = function(){ return { getPropertyValue: function(){ return ''; } }; };
            window.matchMedia = function(){ return { matches: false, media: '', addListener: function(){}, removeListener: function(){}, addEventListener: function(){}, removeEventListener: function(){} }; };
            window.locationbar = { visible: true }; window.menubar = { visible: true }; window.personalbar = { visible: true };
            window.scrollbars = { visible: true }; window.statusbar = { visible: true }; window.toolbar = { visible: true };
            window.styleMedia = { type: 'screen' };
            window.visualViewport = { width: 1680, height: 938, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1 };
            // 补齐 globalThis 缺失的浏览器 API（瑞数 _$g7 检测链）
            if (!window.indexedDB) window.indexedDB = { open: function(){ return { onerror: null, onsuccess: null, result: null }; }, deleteDatabase: function(){ return {}; } };
            if (!window.BroadcastChannel) window.BroadcastChannel = function(){ this.postMessage = function(){}; this.close = function(){}; this.addEventListener = function(){}; };
            if (!window.caches) window.caches = { open: function(){ return Promise.resolve({}); }, match: function(){ return Promise.resolve(undefined); }, keys: function(){ return Promise.resolve([]); } };
            if (!window.PerformanceObserver) window.PerformanceObserver = function(){ this.observe = function(){}; this.disconnect = function(){}; this.takeRecords = function(){ return []; }; };
            if (!window.WebSocket) window.WebSocket = function(){ this.send = function(){}; this.close = function(){}; this.addEventListener = function(){}; this.readyState = 0; };
            // 标准内建显式声明（避免 Proxy 假象/缺失）
            window.Date = Date; window.Error = Error; window.Array = Array; window.ArrayBuffer = ArrayBuffer;
            window.DataView = DataView; window.Infinity = Infinity; window.JSON = JSON; window.Math = Math;
            window.Object = Object; window.String = String; window.Number = Number; window.Boolean = Boolean;
            window.__envAligned = true;
          `);
          console.log('环境值对齐 V8 buildEnv 完成');
        } catch (e) { console.log('环境对齐失败:', String(e).substring(0, 80)); }
      // ★★ 注入 V8 采集的检测变量 + _$l5 快照（dispatcher #3 环境检测标准答案）
      try {
        const l5f = path.join(OUT, 'l5_from_v8.json');
        if (fs.existsSync(l5f)) {
          const data = JSON.parse(fs.readFileSync(l5f, 'utf8'));
          const v8v = Object.assign({ l5: data.l5 }, data.vv || {});
          const v8json = JSON.stringify(v8v);
          const v8h = vm.newString(v8json);
          sp(vm.global, '__v8v', v8h);
          console.log('已注入 __v8v（检测变量 + l5', data.l5.length, '）');
        } else {
          console.log('l5_from_v8.json 不存在，跳过注入');
        }
      } catch (e) { console.log('注入 __v8v 失败:', String(e).substring(0, 80)); }
      } catch (e) { console.log('window 同步失败:', String(e).substring(0, 80)); }
    } catch (e) { console.log('Proxy eval 失败:', String(e).substring(0, 80)); }
    let outerJs = fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8');
    // 插桩：确认 if($_ts.cd) 进入 + VM while 迭代
    outerJs = outerJs.replace('if($_ts.cd){', 'if($_ts.cd){window.__inCd=true;');
    outerJs = outerJs.replace(/while\(1\)\{_\$bG=_\$pl\[_\$fO\+\+\];/, 'while(1){window.__vmI=(window.__vmI||0)+1;if(window.__vmI>5000)throw new Error("VM_LOOP_"+_$bG);_$bG=_$pl[_$fO++];');
    console.log('外层 JS:', outerJs.length, 'B（已插桩）');
    // dump $_ts 验证 cd
    try {
      const tsd = vm.evalCode('JSON.stringify({t: typeof $_ts, cdLen: typeof $_ts.cd === "string" ? $_ts.cd.length : typeof $_ts.cd, nsd: $_ts.nsd, hasCd: !!$_ts.cd})');
      if (!tsd.error) console.log('$_ts 状态:', vm.dump(tsd.value));
      // dump aebi（可能含原生 eval 引用）
      try {
        const ab = vm.evalCode('(function(){try{var s="";if(Array.isArray($_ts.aebi)){s="arr:"+$_ts.aebi.length+":"+$_ts.aebi.slice(0,10).map(function(x){return typeof x}).join(",");}else{s="type:"+typeof $_ts.aebi;}return s;}catch(e){return "err:"+String(e);}})()');
        if (!ab.error) console.log('aebi 状态:', vm.dump(ab.value));
        // dump jf/lcd/cp（可能含 eval 引用）
        const jf = vm.evalCode('(function(){try{var j=$_ts.jf;if(j===undefined||j===null)return "jf:undefined";if(Array.isArray(j))return "jf:arr:"+j.length+":"+j.slice(0,8).map(function(x){return typeof x}).join(",");return "jf:"+typeof j;}catch(e){return "jf:err:"+String(e);}})()');
        if (!jf.error) console.log(vm.dump(jf.value));
        const lcd = vm.evalCode('(function(){try{var j=$_ts.lcd;if(j===undefined||j===null)return "lcd:undefined";return "lcd:"+typeof j;}catch(e){return "lcd:err:"+String(e);}})()');
        if (!lcd.error) console.log(vm.dump(lcd.value));
        const cpv = vm.evalCode('(function(){try{var j=$_ts.cp;if(j===undefined||j===null)return "cp:undefined";return "cp:"+typeof j;}catch(e){return "cp:err:"+String(e);}})()');
        if (!cpv.error) console.log(vm.dump(cpv.value));
      } catch (e) { console.log('dump aebi 失败:', String(e).substring(0, 60)); }
    } catch (e) { console.log('$_ts dump 失败:', String(e).substring(0, 80)); }
    console.log('开始执行（quickjs）...');
    // 执行中断 handler（限 12s，诊断卡点）
    let execStart = 0;
    try {
      vm.runtime.setInterruptHandler(() => {
        if (execStart && Date.now() - execStart > 12000) return true;
        return false;
      });
    } catch (e) { console.log('interrupt 设置失败:', String(e).substring(0, 60)); }
    const t0 = Date.now();
    execStart = t0;
    let result = null;
    try {
      result = vm.evalCode(outerJs, 'outer.js');
    } catch (e) {
      console.log('evalCode 宿主异常:', String(e).substring(0, 150));
      throw e;
    }
    const elapsed = Date.now() - t0;
    console.log('执行耗时:', elapsed, 'ms');
    // 执行 microtask（Promise 回调——外层 JS 的 fetch 异步链依赖）
    for (let i = 0; i < 200; i++) {
      if (!vm.runtime.hasPendingJob()) break;
      vm.runtime.executePendingJobs();
    }
    console.log('pending jobs 执行完毕');
    if (!result) { console.log('evalCode 返回 null'); throw new Error('evalCode null'); }
    if (result.error) {
      const err = vm.dump(result.error);
      console.log('执行错误:', JSON.stringify(err).substring(0, 400));
      // 错误对象可能含 message/stack
      if (err && typeof err === 'object') {
        try {
          const mh = vm.getProp(result.error, 'message');
          const ms = vm.dump(mh);
          console.log('错误消息:', String(ms).substring(0, 200));
          const sh = vm.getProp(result.error, 'stack');
          const ss = vm.dump(sh);
          console.log('错误堆栈:', String(ss).substring(0, 400));
        } catch (e) { console.log('读错误详情失败'); }
      }
    } else {
      const val = vm.dump(result.value);
      console.log('执行结果:', val === undefined ? 'undefined' : JSON.stringify(val).substring(0, 100));
    }
    // dump window 状态（看外层 JS 初始化到哪步）
    try {
      const inLog = vm.evalCode('JSON.stringify({inLog: (typeof window.__getInLog === "function" ? window.__getInLog() : "none"), winMiss: (window.__winMiss||[]).slice(-15).join(","), jpR: (window.__jpRs||[]).join("|")})');
      // dump _$pb 字节码 + 轨迹
      try {
        const pb = vm.evalCode('JSON.stringify(window.__pbArr||[])');
        if (!pb.error) {
          const arr = vm.dump(pb.value);
          const tr = vm.evalCode('JSON.stringify(window.__trail||[])');
          const trV = !tr.error ? vm.dump(tr.value) : 'ERR';
          fs.writeFileSync(path.join(OUT, 'w3_bytecode.json'), JSON.stringify({ pb: JSON.parse(arr || '[]'), trail: trV === 'ERR' ? [] : JSON.parse(trV || '[]') }, null, 1));
          console.log('已保存 w3_bytecode.json');
        }
      } catch (e) { console.log('dump pb 失败:', String(e).substring(0, 60)); }
      const inLogV = !inLog.error ? vm.dump(inLog.value) : 'ERR';
      const st = vm.evalCode('JSON.stringify({inCd: !!window.__inCd, vmI: window.__vmI||0, tsKeys: window.$_ts ? Object.keys(window.$_ts).slice(0,30) : [], tsType: typeof window.$_ts})');
      if (!st.error) console.log('window 状态:', vm.dump(st.value), inLogV);
      // eval/Function 异常参数定位
      try {
        const eb = vm.evalCode('JSON.stringify(window.__evalBad||null)');
        if (!eb.error) console.log('eval 异常参数:', vm.dump(eb.value));
        const fb = vm.evalCode('JSON.stringify(window.__fnBad||null)');
        if (!fb.error) console.log('Function 异常参数:', vm.dump(fb.value));
        const eu = vm.evalCode('JSON.stringify(window.__evalUndef||null)');
        if (!eu.error) console.log('eval 含undefined:', vm.dump(eu.value));
        const fu = vm.evalCode('JSON.stringify(window.__fnUndef||null)');
        if (!fu.error) console.log('Function 含undefined:', vm.dump(fu.value));
      } catch (e) { console.log('dump 异常定位失败:', String(e).substring(0, 60)); }
      // _$cz 输入记录（最后 20 个）
      try {
        const cz = vm.evalCode('JSON.stringify((window.__czLog||[]).slice(-20))');
        if (!cz.error) console.log('_$cz 输入:', vm.dump(cz.value));
      } catch (e) { console.log('dump czLog 失败:', String(e).substring(0, 60)); }
      // 保存插桩后动态代码（定位 168156）
      try {
        const dc = vm.evalCode('window.__dynCode || ""');
        if (!dc.error) {
          const dcStr = vm.dump(dc.value);
          if (typeof dcStr === 'string' && dcStr.length > 100000) {
            fs.writeFileSync(path.join(OUT, 'quickjs_dyn_patched.js'), dcStr);
            console.log('已保存 quickjs_dyn_patched.js，长度', dcStr.length);
            if (dcStr.length > 168156) {
              console.log('@168156:', JSON.stringify(dcStr.substring(168000, 168300)));
            }
          }
        }
      } catch (e) { console.log('保存动态代码失败:', String(e).substring(0, 60)); }
      // 导出 quickjs 的 _$ne 轨迹（diff V8）
      try {
        const qtr = vm.evalCode('JSON.stringify(window.__neTr2||[])');
        if (!qtr.error) {
          const qtrV = JSON.parse(vm.dump(qtr.value) || '[]');
          fs.writeFileSync(path.join(OUT, 'quickjs_ne_tr.json'), JSON.stringify(qtrV, null, 0));
          console.log('已保存 quickjs_ne_tr.json，长度', qtrV.length);
        }
      } catch (e) { console.log('dump quickjs 轨迹失败:', String(e).substring(0, 60)); }
    } catch (e) { console.log('dump 状态失败:', String(e).substring(0, 60)); }
    // 等待异步 + 读状态
    await new Promise(r => setTimeout(r, 3000));
    try {
      // 读 eval 捕获信息
      const ei = vm.evalCode('JSON.stringify(window.__evalInfo || {})');
      if (!ei.error) {
        const info = vm.dump(ei.value);
        console.log('eval 捕获:', info);
      }
    } catch (e) { console.log('读 eval 信息失败:', String(e).substring(0, 60)); }
    // 读 cookie
    try {
      const cookieH = vm.getProp(doc, 'cookie');
      const cookieVal = vm.dump(cookieH);
      console.log('document.cookie:', String(cookieVal).substring(0, 120));
      if (String(cookieVal).includes('P=')) console.log('★★★ cookie 生成成功！');
    } catch (e) { console.log('读 cookie 失败:', String(e).substring(0, 80)); }
    // 不 dispose（handle 泄漏会 Aborted）——进程退出自动清理
  } catch (e) {
    console.log('宿主异常堆栈:', (e && e.stack || String(e)).substring(0, 600));
  }
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
