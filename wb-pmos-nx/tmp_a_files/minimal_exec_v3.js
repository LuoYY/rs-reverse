// 最小符号执行 v3：纯 Node vm 执行 dynCode（scj/aebi 已捕获）
// 验证：无 jsdom 环境，用捕获的 scj/aebi 能否完整执行 dynCode 输出 base
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// 1. 加载捕获的 scj/aebi
const inputs = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_scj_aebi2.json', 'utf8'));
const scj = inputs.scj;
const aebi = inputs.aebi;
console.log('scj:', JSON.stringify(scj).slice(0, 80));
console.log('aebi len:', aebi.length, 'aebi[1] len:', aebi[1].length);

// 2. dynCode（用插桩版本捕获 _$ez，但本地固定下 dynCode 一致）
const dynCode = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_cs_patched.js', 'utf8');

// 3. 纯 Node vm 环境（最小，无 jsdom）
const sandbox = {
  $_ts: { scj, aebi, nsd: 67402, cd: '', cp: null },
  console,
  globalThis: {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Promise,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', appVersion: '', platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN'], cookieEnabled: true, onLine: true, hardwareConcurrency: 8, maxTouchPoints: 0, userAgentData: undefined },
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1080, colorDepth: 24, pixelDepth: 24 },
  location: { href: 'https://pmos.nx.sgcc.com.cn:10443/', protocol: 'https:', host: 'pmos.nx.sgcc.com.cn:10443', hostname: 'pmos.nx.sgcc.com.cn', port: '10443', pathname: '/', search: '', hash: '' },
  history: { length: 1 },
  document: { cookie: '', referrer: '', title: '', readyState: 'complete', documentElement: { style: {} }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, getContext: () => null, getBoundingClientRect: () => ({ width: 0, height: 0 }) }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, createEvent: () => ({}) },
  window: {}, self: {}, top: {}, parent: {}, frames: {}, frameElement: null,
  performance: { now: () => Date.now() },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox; sandbox.frames = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
console.log('\n=== 纯 Node vm 执行 dynCode ===');
const t0 = Date.now();
try {
  vm.runInContext(dynCode, sandbox, { timeout: 40000 });
  console.log('执行完成! 耗时 ' + (Date.now() - t0) + 'ms');
  // 检查输出
  console.log('_$ts keys:', Object.keys(sandbox.$_ts).join(','));
  for (const k of Object.keys(sandbox.$_ts)) {
    const v = sandbox.$_ts[k];
    if (Array.isArray(v)) console.log('  ' + k + ' = array[' + v.length + '] head=' + JSON.stringify(v.slice(0, 3)).slice(0, 60));
    else if (typeof v === 'object' && v) console.log('  ' + k + ' = object keys=' + Object.keys(v).join(','));
    else console.log('  ' + k + ' = ' + String(v).slice(0, 60));
  }
  console.log('\n__ 全局:', Object.keys(sandbox).filter(k => k.startsWith('__')).join(','));
} catch (e) {
  console.log('执行失败:', e.message.slice(0, 200));
  if (e.stack) console.log('栈:', e.stack.split('\n').slice(1, 4).join('\n'));
}
process.exit(0);
