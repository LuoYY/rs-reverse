/**
 * 726_vm_debug.js
 * 调试 vm 沙箱跑应用 js：检查 $_ts、错误、运行进度、dynCode
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js');
const NX_TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const NX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];

  const env = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA });
  const sb = env.sandbox;
  console.log('[0] $_ts 类型:', typeof sb.$_ts, sb.$_ts ? JSON.stringify(sb.$_ts).substring(0, 100) : 'undefined');
  console.log('[0] window.$_ts:', sb.window && typeof sb.window.$_ts);

  // 注入 polyfill + 日志
  vm.runInContext(`
    window.__log = [];
    var _w = console.log ? console.log : null;
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, sb);

  const appJs = fs.readFileSync(APP_JS, 'utf8');
  try {
    vm.runInContext(appJs, sb, { timeout: 20000, filename: 'app.js' });
    console.log('[1] 应用 js 执行完成（无异常）');
  } catch (e) {
    console.log('[1] 异常:', e.message.substring(0, 100));
    if (e.stack) {
      const m = e.stack.split('\n').slice(0, 8).join('\n');
      console.log('  栈:', m);
    }
  }
  await new Promise(r => setTimeout(r, 8000));

  // 检查状态
  console.log('[2] cookies:', (sb.window.__cookies || []).length, sb.window.__cookies);
  console.log('[2] errors:', (sb.window.__errors || []).slice(0, 5));
  try {
    const tsNow = vm.runInContext('typeof $_ts !== "undefined" ? JSON.stringify($_ts).substring(0, 80) : "undef"', sb);
    console.log('[2] $_ts 现在:', tsNow);
  } catch (e) {}
  try {
    const dyn = vm.runInContext('typeof window.__dyn !== "undefined" ? "dyn:" + window.__dyn.length : "no"', sb);
    console.log('[2] dynCode:', dyn);
  } catch (e) {}
  // eval 捕获
  console.log('[2] document.title:', vm.runInContext('document.title', sb));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
