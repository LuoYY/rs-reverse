// 离线执行 dynCode：buildEnv 沙箱 + 注入 scj/aebi（inputs2），不跑外层 VM
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
  console.log('[R2] cd.len=' + inputs.cd.length + ' aebi=' + inputs.aebi.map(a => a.length).join('/'));
  console.log('[R2] scj:', JSON.stringify(inputs.scj).substring(0, 100));

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const env = buildEnv({ nsd: 67402, cd: inputs.cd }, { target: TARGET, ua: UA, patchDyn: false });
  const sandbox = env.sandbox;

  // 注入 $_ts
  const tsObj = {
    nsd: 67402,
    cd: inputs.cd,
    scj: inputs.scj,
    aebi: inputs.aebi,
  };
  sandbox.$_ts = tsObj;
  sandbox.window.$_ts = tsObj;
  sandbox.globalThis.$_ts = tsObj;

  const dynCode = fs.readFileSync('/tmp/nx_dynCode_captured_2.js', 'utf8');
  console.log('[R2] dynCode len:', dynCode.length);

  const t0 = Date.now();
  try {
    const r = vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'dyn.js' });
    console.log('[R2] 返回:', typeof r);
    if (r && typeof r === 'object') {
      console.log('[R2] keys:', Object.keys(r).join(','));
      const dE = r['_$dE'];
      console.log('[R2] _\$dE type:', typeof dE);
      if (Array.isArray(dE)) console.log('[R2] _\$dE head:', dE.slice(0, 20).join(','));
      if (typeof dE === 'string') console.log('[R2] _\$dE:', dE.substring(0, 50));
    }
  } catch (e) {
    console.log('[R2] 异常:', e.message.substring(0, 200));
  }
  console.log('[R2] 耗时', Date.now() - t0, 'ms');
  console.log('[R2] errors:', env.captured.errors.slice(0, 3));
  process.exit(0);
})().catch(e => { console.error('[R2] FATAL:', e.message); process.exit(1); });
