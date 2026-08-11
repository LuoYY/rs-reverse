// 完整补全 buildEnv window 属性（对齐 sdenv），跑 nx dynCode
// 核心：瑞数环境检测访问 window[prop]，buildEnv 缺属性返回 undefined → 检测异常
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const ts = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_ts_full2.json'), 'utf8'));
  let dynCode = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');

  // patch 回跳（防止 _$lj=true 死循环）
  dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=-?\d+:0;/g, '0;');
  dynCode = dynCode.replace(/_\$oL\+=-?\d+:0;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });
  dynCode = dynCode.replace(/_\$oL\+=-?\d+;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  // 补全 window 属性（瑞数环境检测常用）
  const noop = () => {};
  const extra = {
    // 导航/网络
    fetch: sandbox.fetch, XMLHttpRequest: sandbox.XMLHttpRequest, WebSocket: sandbox.WebSocket,
    // 性能
    performance: sandbox.performance,
    // Canvas（瑞数检测 2D/WebGL 指纹）
    HTMLCanvasElement: function () {}, CanvasRenderingContext2D: function () {}, WebGLRenderingContext: function () {},
    // 字体/媒体
    FontFace: function () {}, Image: sandbox.Image, Audio: function () {}, Option: sandbox.Option,
    // DOM
    HTMLElement: sandbox.HTMLElement, HTMLDivElement: function () {}, HTMLSpanElement: function () {},
    HTMLDocument: function () {}, Document: function () {}, Window: function () {}, Node: sandbox.Node,
    Element: sandbox.Element, Event: function () {}, CustomEvent: function () {}, MouseEvent: function () {},
    KeyboardEvent: function () {}, TouchEvent: function () {}, WheelEvent: function () {},
    MutationObserver: sandbox.MutationObserver, IntersectionObserver: function () {},
    ResizeObserver: function () {}, DOMParser: sandbox.DOMParser, XMLSerializer: function () {},
    // 存储
    localStorage: sandbox.localStorage, sessionStorage: sandbox.sessionStorage, indexedDB: sandbox.indexedDB,
    // 加密
    crypto: sandbox.crypto, SubtleCrypto: function () {},
    // 定时器
    setTimeout: sandbox.setTimeout, clearTimeout: sandbox.clearTimeout, setInterval: sandbox.setInterval, clearInterval: sandbox.clearInterval,
    requestAnimationFrame: sandbox.requestAnimationFrame, cancelAnimationFrame: sandbox.cancelAnimationFrame,
    // 其他
    Worker: function () {}, SharedWorker: function () {}, ServiceWorker: function () {},
    MessageChannel: function () {}, MessagePort: function () {}, BroadcastChannel: sandbox.BroadcastChannel,
    TextEncoder: sandbox.TextEncoder, TextDecoder: sandbox.TextDecoder,
    URL: sandbox.URL, URLSearchParams: sandbox.URLSearchParams,
    Blob: sandbox.Blob, FileReader: sandbox.FileReader, FormData: function () {},
    Headers: function () {}, Request: function () {}, Response: function () {},
    // 视口
    innerWidth: 1680, innerHeight: 938, outerWidth: 1680, outerHeight: 1025, devicePixelRatio: 2,
    screenX: 0, screenY: 0, pageXOffset: 0, pageYOffset: 0,
    // 事件
    addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
    getComputedStyle: sandbox.getComputedStyle, matchMedia: sandbox.matchMedia,
    // 函数
    parseFloat, parseInt, isNaN, isFinite, eval: sandbox.eval,
    // 控制台（瑞数可能读取）
    console: sandbox.console,
    // 全局
    Infinity, NaN, undefined,
  };
  for (const [k, v] of Object.entries(extra)) {
    if (sandbox[k] === undefined) sandbox[k] = v;
  }

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[EF] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[EF] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[EF] 列号:', col, '错误点:', dynCode.slice(col - 80, col + 80));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[EF] cookie:', q('typeof document!=="undefined"&&document.cookie?document.cookie.slice(0,60):null'));
  console.log('[EF] ktF:', q('typeof __ktF!=="undefined"?__ktF.length:null'));
  process.exit(0);
})().catch(e => { console.error('[EF] FATAL:', e.message); process.exit(1); });
