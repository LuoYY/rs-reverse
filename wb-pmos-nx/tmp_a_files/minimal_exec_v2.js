// 最小符号执行 v2：纯 Node vm 执行 dynCode
// 输入：aebi[1]（静态 2553 条）+ $_ts 结构 + _$ez（keys 组装）
// 目标：捕获 base 输出，验证纯算法闭环
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// 1. 加载 aebi[1]（2553 opcode）
const aebi1 = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_aebi1.json', 'utf8'));
console.log('aebi[1] len:', aebi1.length);

// 2. 加载捕获的 _$ez（本地固定 challenge）
const ezSnap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = ezSnap[0].ez.v;
console.log('_$ez len:', ez.length);

// 3. aebi 完整结构：aebi 是数组，[1] 是主指令流。构造完整 aebi
// 从 dynCode 中 _\lP 的使用：aebi 是多段数组（6 段对应 6 层 VM）
// 但主执行用 [1]，其余段可能也需要。先只给 [1]
const aebi = [null, aebi1]; // aebi[0] 未知，aebi[1]=指令流

// 4. 纯 Node vm 执行
const dynCode = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_cs_patched.js', 'utf8');
const sandbox = {
  $_ts: { scj: {}, aebi, nsd: 67402, cd: '', cp: null },
  console,
  globalThis: {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Promise,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', appVersion: '', platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN'], cookieEnabled: true, onLine: true, hardwareConcurrency: 8, maxTouchPoints: 0 },
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1080, colorDepth: 24, pixelDepth: 24 },
  location: { href: 'https://pmos.nx.sgcc.com.cn:10443/', protocol: 'https:', host: 'pmos.nx.sgcc.com.cn:10443', hostname: 'pmos.nx.sgcc.com.cn', port: '10443', pathname: '/', search: '', hash: '' },
  history: { length: 1 },
  document: { cookie: '', referrer: '', title: '', readyState: 'complete', documentElement: { style: {} }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, getContext: () => null }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
  window: {}, self: {}, top: {}, parent: {}, frames: {}, frameElement: null,
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox; sandbox.frames = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
console.log('\n=== 纯 Node vm 执行 dynCode ===');
const t0 = Date.now();
try {
  vm.runInContext(dynCode, sandbox, { timeout: 40000 });
  console.log('执行完成! 耗时 ' + (Date.now() - t0) + 'ms');
  console.log('_$ts keys:', Object.keys(sandbox.$_ts).join(','));
  for (const k of Object.keys(sandbox.$_ts)) {
    const v = sandbox.$_ts[k];
    if (Array.isArray(v)) console.log('  ' + k + ' = array[' + v.length + ']');
    else if (typeof v === 'object' && v) console.log('  ' + k + ' = object');
    else console.log('  ' + k + ' = ' + String(v).slice(0, 60));
  }
  // 找 base 相关输出
  console.log('\n__ 全局:', Object.keys(sandbox).filter(k => k.startsWith('__')).join(','));
  console.log('__ezMin:', sandbox.__ezMin ? 'len=' + sandbox.__ezMin.length : 'null');
} catch (e) {
  console.log('执行失败:', e.message.slice(0, 150));
  if (e.stack) console.log(e.stack.split('\n').slice(0, 3).join('\n'));
}
process.exit(0);
