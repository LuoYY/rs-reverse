// 用 runSandbox 完整流程（能生成 P cookie）+ Proxy eval 插桩 dynCode return 点
// 插桩目标：dump _$hr（basearr 数组）+ 环境编码段，验证 basearr 结构
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const ch = JSON.parse(fs.readFileSync('/tmp/nx_local_challenge.json', 'utf8'));
  const nsd = ch.nsd, cd = ch.cd;
  console.log('[RSB] nsd=' + nsd + ' cdLen=' + cd.length);

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

  // 自定义 Proxy eval：patchDyn 分支里插桩 dynCode return 点
  const env = buildEnv({ nsd, cd }, {
    outerJsCode, target: TARGET, ua: UA,
    patchDyn: true, timeout: 90000, waitMs: 10000,
    debugLog: true,
  });

  // 手工执行外层 VM（buildEnv 已经 Proxy eval 好，但 runSandbox 才是主流程）
  const sandbox = env.sandbox;
  const t0 = Date.now();
  try { vm.runInContext(outerJsCode, sandbox, { timeout: 80000, filename: 'outer.js' }); }
  catch (e) { console.log('[RSB] outer:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 10000));

  console.log('[RSB] 耗时', Date.now() - t0, 'ms');
  console.log('[RSB] cookies:', env.captured.cookies.length);
  console.log('[RSB] P cookie:', (env.captured.cookies.map(c => c.split(';')[0]).find(c => /P=/.test(c)) || 'NONE').substring(0, 80));
  console.log('[RSB] errors:', env.captured.errors.slice(0, 3));
  console.log('[RSB] dynCode len:', env.getDynCode() ? env.getDynCode().length : 0);
  process.exit(0);
})().catch(e => { console.error('[RSB] FATAL:', e.message); process.exit(1); });
