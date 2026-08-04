/**
 * 728_A106_app_ts_rewrite.js
 * 检查应用 js 运行后 $_ts 是否被重写（加数字键）
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

  const env1 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env1.sandbox);
  try { vm.runInContext(fs.readFileSync(APP_JS, 'utf8'), env1.sandbox, { timeout: 30000, filename: 'app.js' }); } catch (e) { console.log('应用 js 异常:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 5000));
  try {
    const info = vm.runInContext(`JSON.stringify((()=>{const t=$_ts||{};const ks=Object.keys(t);return {keys:ks, has0:'0' in t, t0type:typeof t[0], t0:(typeof t[0]!=='undefined')?String(t[0]).substring(0,80):null, t1type:typeof t[1], t2type:typeof t[2], cpLen:Array.isArray(t.cp)?t.cp.length:typeof t.cp, aebi:Array.isArray(t.aebi)?t.aebi.map(a=>Array.isArray(a)?a.length:typeof a).join(','):typeof t.aebi};})())`, env1.sandbox);
    console.log('应用 js 后 $_ts:', info);
  } catch (e) { console.log('读取失败:', e.message.substring(0, 100)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
