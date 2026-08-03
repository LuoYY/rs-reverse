/**
 * 728_A1_capture_appjs.js
 * 在 Node vm 沙箱（buildEnv）跑应用 js（Dl5ApMEho6Yq）：
 *  - eval hook 捕获 dynCode（外层 VM 生成的 cp[3]）
 *  - 提取 $_ts 状态（aebi/scj 等，供后续注入）
 *  - 记录 cookie 写入 / 错误
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
  console.log('nsd=' + nsd + ' cd len=' + cd.length);

  const env = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: true });
  const sb = env.sandbox;
  // __proxy + 日志（不用 console hook，瑞数检测）
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
    window.__err = null;
  `, sb);

  console.log('[1] 跑应用 js...');
  const appJs = fs.readFileSync(APP_JS, 'utf8');
  const t0 = Date.now();
  let err = null;
  try { vm.runInContext(appJs, sb, { timeout: 30000, filename: 'app.js' }); }
  catch (e) { err = e; console.log('运行异常:', e.message.substring(0, 120)); }
  console.log('外层耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');

  await new Promise(r => setTimeout(r, 10000));

  const dyn = env.getDynCode();
  console.log('[2] dynCode:', dyn ? 'len=' + dyn.length : '无');
  if (dyn) fs.writeFileSync('/tmp/nx_appjs_vm_dyn.js', dyn);

  // $_ts 状态
  try {
    const tsStr = vm.runInContext('typeof $_ts !== "undefined" ? JSON.stringify({keys:Object.keys($_ts), aebi:(($_ts.aebi||[]).map(function(a){return Array.isArray(a)?a.length:typeof a;})).join(","), scj:(typeof $_ts.scj)}).substring(0, 300) : "undef"', sb);
    console.log('[3] $_ts:', tsStr);
  } catch (e) { console.log('[3] $_ts 读取失败:', e.message.substring(0, 60)); }

  // cookie / 错误
  try {
    const ck = vm.runInContext('document.cookie', sb);
    console.log('[4] cookie:', String(ck).substring(0, 80), 'len=' + String(ck).length);
  } catch (e) {}
  console.log('[4] errors:', env.captured.errors.slice(0, 5));
  console.log('[4] missing:', env.captured.missing.slice(0, 30));
  console.log('[4] evalLens:', env.captured.evalLens);
  try {
    const d = vm.runInContext('window.__dynDone ? "done" : "not-done"', sb);
    console.log('[5] __dynDone:', d);
  } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
