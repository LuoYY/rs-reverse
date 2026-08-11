// 最小符号执行 v4：注入捕获的 _$ez（1532B）+ scj/aebi
// 绕过 dynCode 内部的 _$ez 初始化
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const inputs = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_scj_aebi2.json', 'utf8'));
const scj = inputs.scj;
const aebi = inputs.aebi;
const ezSnap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = ezSnap[0].ez.v;

// dynCode 修改：在 IIFE 内注入捕获的 _$ez（hook 到 _$c4 的 _$ez 参数）
let dynCode = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_cs_patched.js', 'utf8');

// 关键：找到 _$ez 在 dynCode 中的初始化（可能 = 某个常量池构建）
// 或者直接注入全局 __injectedEz，在 _$c4 内替换
// _$c4 签名: function _$c4(_$cg,_$ez,_$pL,_$gc,_$pb,_$nx,_$cQ)
// 在 _$c4 开头注入: if(globalThis.__injEz) _$ez = globalThis.__injEz;
const c4Sig = 'function _$c4(_$cg,_$ez,_$pL,_$gc,_$pb,_$nx,_$cQ){';
if (dynCode.includes(c4Sig)) {
  dynCode = dynCode.split(c4Sig).join(c4Sig + 'try{if(globalThis.__injEz)_$ez=globalThis.__injEz;}catch(__e){}');
  console.log('注入 _$ez hook OK');
} else {
  console.log('✗ _$c4 签名未找到');
  // 打印实际签名
  const m = dynCode.match(/function _\$c4\([^)]*\)\{/);
  console.log('实际签名:', m ? m[0] : 'none');
}

// 纯 Node vm 执行
const sandbox = {
  $_ts: { scj, aebi, nsd: 67402, cd: '', cp: null },
  __injEz: ez,
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
console.log('\n=== 纯 Node vm 执行 dynCode（注入 _$ez） ===');
const t0 = Date.now();
try {
  vm.runInContext(dynCode, sandbox, { timeout: 40000 });
  console.log('执行完成! 耗时 ' + (Date.now() - t0) + 'ms');
  console.log('_$ts keys:', Object.keys(sandbox.$_ts).join(','));
  for (const k of Object.keys(sandbox.$_ts)) {
    const v = sandbox.$_ts[k];
    if (Array.isArray(v)) console.log('  ' + k + ' = array[' + v.length + '] head=' + JSON.stringify(v.slice(0, 3)).slice(0, 50));
    else if (typeof v === 'object' && v) console.log('  ' + k + ' = object');
    else console.log('  ' + k + ' = ' + String(v).slice(0, 40));
  }
  console.log('\n__ 全局:', Object.keys(sandbox).filter(k => k.startsWith('__')).join(','));
} catch (e) {
  console.log('执行失败:', e.message.slice(0, 150));
  if (e.stack) console.log('栈:', e.stack.split('\n').slice(1, 3).join('\n'));
}
process.exit(0);
