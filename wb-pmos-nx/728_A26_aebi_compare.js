/**
 * 728_A26_aebi_compare.js
 * 对比沙箱生成的 aebi 与浏览器真实 aebi（从浏览器样本里找）
 */
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

  const env0 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env0.sandbox);
  const appJs = fs.readFileSync(APP_JS, 'utf8');
  try { vm.runInContext(appJs, env0.sandbox, { timeout: 30000, filename: 'app.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  try {
    const tsStr = vm.runInContext('typeof $_ts !== "undefined" ? JSON.stringify($_ts) : "null"', env0.sandbox);
    const td = JSON.parse(tsStr);
    console.log('沙箱 aebi 各组长度:', (td.aebi || []).map(g => Array.isArray(g) ? g.length : typeof g).join(','));
    for (let i = 0; i < (td.aebi || []).length; i++) {
      const g = td.aebi[i];
      if (Array.isArray(g)) {
        fs.writeFileSync(`/tmp/nx_sandbox_aebi_${i}.json`, JSON.stringify(g));
        console.log(`aebi[${i}] 前 20:`, g.slice(0, 20).map(x => (typeof x === 'string' ? 's:' + x.substring(0, 15) : x)).join(','));
      }
    }
  } catch (e) { console.log('aebi 提取失败:', e.message.substring(0, 80)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
