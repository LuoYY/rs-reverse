// 最小符号执行 v6：捕获同一会话的 scj/aebi/常量池/_$ez，注入执行
// 目标：同会话输入下，纯 Node vm 完整执行 dynCode → base
// 关键：常量池在 dynCode 执行时从 scj/aebi 动态构建（不注入静态表）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// 从 sdenv 捕获 scj/aebi（本地固定）
const inputs = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_scj_aebi2.json', 'utf8'));
const scj = inputs.scj;
const aebi = inputs.aebi;

// dynCode：用最原始的（无插桩，避免破坏）
const dynCode = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
console.log('dynCode len:', dynCode.length);

// 纯 Node vm 最小环境
const sandbox = {
  $_ts: { scj, aebi, nsd: 67402, cd: '', cp: null },
  console,
  globalThis: {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Promise,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', appVersion: '', platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN'], cookieEnabled: true, onLine: true, hardwareConcurrency: 8, maxTouchPoints: 0 },
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1080, colorDepth: 24, pixelDepth: 24 },
  location: { href: 'https://pmos.nx.sgcc.com.cn:10443/', protocol: 'https:', host: 'pmos.nx.sgcc.com.cn:10443', hostname: 'pmos.nx.sgcc.com.cn', port: '10443', pathname: '/', search: '', hash: '' },
  history: { length: 1 },
  document: { cookie: '', referrer: '', title: '', readyState: 'complete', documentElement: { style: {} }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, getContext: () => null, getBoundingClientRect: () => ({ width: 0, height: 0 }) }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, createEvent: () => ({}) },
  window: {}, self: {}, top: {}, parent: {}, frames: {}, frameElement: null,
  performance: { now: () => Date.now() },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox; sandbox.frames = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
console.log('\n=== 纯 Node vm 执行 dynCode（同会话 scj/aebi） ===');
const t0 = Date.now();
try {
  vm.runInContext(dynCode, sandbox, { timeout: 45000 });
  console.log('执行完成! 耗时 ' + (Date.now() - t0) + 'ms');
  console.log('_$ts keys:', Object.keys(sandbox.$_ts).join(','));
  for (const k of Object.keys(sandbox.$_ts)) {
    const v = sandbox.$_ts[k];
    if (Array.isArray(v)) console.log('  ' + k + ' = array[' + v.length + '] head=' + JSON.stringify(v.slice(0, 3)).slice(0, 40));
    else if (typeof v === 'object' && v) console.log('  ' + k + ' = object');
    else console.log('  ' + k + ' = ' + String(v).slice(0, 30));
  }
} catch (e) {
  console.log('执行失败:', e.message.slice(0, 200));
  if (e.stack) console.log('栈:', e.stack.split('\n').slice(1, 3).join('\n'));
}
process.exit(0);
