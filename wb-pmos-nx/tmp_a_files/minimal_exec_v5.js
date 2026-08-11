// 最小符号执行 v5：注入完整常量池（tables_init.json）+ scj/aebi + _$ez
// 目标：完整执行 dynCode，输出 base
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
const tables = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));

// 构造常量池注入代码
function buildConsts() {
  const lines = [];
  for (const k of Object.keys(tables)) {
    const v = tables[k];
    if (v.type === 'array') lines.push(`var ${k}=${JSON.stringify(v.val)};`);
    else if (v.type === 'function') {
      // 函数已在 dynCode 内定义，跳过（避免重复声明）
    } else if (v.type === 'object') {
      if (v.keys) {
        const kvs = v.keys.map((kk, i) => `${JSON.stringify(kk)}:${JSON.stringify(v.val ? v.val[i] : null)}`).join(',');
        lines.push(`var ${k}={${kvs}};`);
      } else if (v.val) lines.push(`var ${k}=${JSON.stringify(v.val)};`);
    }
  }
  return lines.join('\n');
}
const consts = buildConsts();

// dynCode 修改：在 IIFE 开头注入常量池
let dynCode = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_cs_patched.js', 'utf8');
// IIFE 头: (function(_$$5,_$lP){var _$la=0;...
const iifeHead = '(function(_$$5,_$lP){';
if (dynCode.includes(iifeHead)) {
  dynCode = dynCode.split(iifeHead).join(iifeHead + '\n' + consts + '\n');
  console.log('常量池注入 OK (' + consts.length + ' 字符)');
} else {
  console.log('✗ IIFE 头未找到');
  console.log('实际头:', dynCode.slice(0, 50));
}

// 纯 Node vm
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
console.log('\n=== 纯 Node vm 执行 dynCode（完整常量池） ===');
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
} catch (e) {
  console.log('执行失败:', e.message.slice(0, 150));
  if (e.stack) console.log('栈:', e.stack.split('\n').slice(1, 3).join('\n'));
}
process.exit(0);
