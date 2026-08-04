/**
 * 728_A50_challenge_aebi.js
 * 先跑挑战 js（83bw0aTvAW7K）外层 VM → 提取 $_ts.aebi，对比浏览器权威 [648,2553,2479,431,38,7]
 * 验证 aebi 是否由挑战 js 生成（而非应用 js）
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
  const chJs = fs.readFileSync(CHALLENGE_JS, 'utf8');
  console.log('[1] 跑挑战 js（外层 VM，超时但捕获 $_ts）...');
  try { vm.runInContext(chJs, env0.sandbox, { timeout: 25000, filename: 'challenge.js' }); } catch (e) { console.log('挑战超时/异常:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 3000));
  try {
    const tsStr = vm.runInContext('typeof $_ts !== "undefined" ? JSON.stringify({keys:Object.keys($_ts), aebiLens:(($_ts.aebi||[]).map(function(a){return Array.isArray(a)?a.length:typeof a;})).join(","), aebi0:JSON.stringify(($_ts.aebi||[])[0]).substring(0,200), scj:JSON.stringify($_ts.scj).substring(0,300)}) : "undef"', env0.sandbox);
    console.log('[2] 挑战 js $_ts:', tsStr);
  } catch (e) { console.log('读取失败:', e.message.substring(0, 80)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
