// buildEnv + 本地固定 challenge 跑外层 VM（完整链路），验证 cookie 生成
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

(async () => {
  // 本地固定 challenge（从 nx_ts_full2 取 nsd/cd——同会话数据）
  const ts = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_ts_full2.json'), 'utf8'));
  const nsd = ts.nsd, cd = ts.cd;
  console.log('[BO] nsd=' + nsd + ' cdLen=' + cd.length);

  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  console.log('[BO] outer len:', outerJsCode.length);

  // buildEnv（patchDyn=false → eval Proxy 截获 dynCode）
  const env = buildEnv({ nsd, cd }, { target: TARGET, ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  // 用同会话的完整 $_ts（覆盖 buildEnv 的 nsd/cd）
  sandbox.$_ts = { nsd, cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(outerJsCode, sandbox, { timeout: 30000, filename: 'outer.js' });
    console.log('[BO] outer 执行完成 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[BO] outer 异常:', e.message.substring(0, 150));
    console.log('[BO] 栈:', (e.stack || '').split('\n').slice(0, 5).join('\n[BO]   '));
  }

  const dynCode = env.getDynCode();
  console.log('[BO] dynCode:', dynCode ? '截获 ' + dynCode.length : '未截获');
  console.log('[BO] errors:', env.captured.errors.slice(-5));
  console.log('[BO] cookies:', env.captured.cookies.length, env.captured.cookies.slice(-3));
  await new Promise(r => setTimeout(r, 8000));
  console.log('[BO] 8s 后 cookies:', env.captured.cookies.slice(-3));
  process.exit(0);
})().catch(e => { console.error('[BO] FATAL:', e.message); process.exit(1); });
