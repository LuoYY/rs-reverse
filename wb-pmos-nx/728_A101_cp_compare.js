/**
 * 728_A101_cp_compare.js
 * 对比浏览器 vs 沙箱的 $_ts.cp（7 元素属性名池容器）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CHALLENGE_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const NX_TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const NX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];

  const env0 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env0.sandbox);
  try { vm.runInContext(fs.readFileSync(CHALLENGE_JS, 'utf8'), env0.sandbox, { timeout: 25000, filename: 'challenge.js' }); } catch (e) { console.log('挑战超时(正常):', e.message.substring(0, 60)); }
  await new Promise(r => setTimeout(r, 3000));
  try {
    const cp = vm.runInContext(`JSON.stringify((()=>{const t=$_ts||{};const c=t.cp||[];return {cpType:typeof c, cpArr:Array.isArray(c), cpLen:Array.isArray(c)?c.length:null, cp0Type:Array.isArray(c)&&typeof c[0], cp0:Array.isArray(c)?JSON.stringify(c[0]).substring(0,300):null, cpKeys:Array.isArray(c)?Object.keys(c).join(','):null};})())`, env0.sandbox);
    console.log('沙箱 $_ts.cp:', cp);
    fs.writeFileSync('/tmp/nx_vm_cp_dump.json', cp);
  } catch (e) { console.log('读取失败:', e.message.substring(0, 80)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
