// 离线运行 dynCode：用已有 scj/aebi/cd 输入 + buildEnv 沙箱，注入执行 + 插桩追踪 basearr
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
  const cd = inputs.cd;
  const aebi = inputs.aebi;
  const scj = inputs.scj;
  console.log('[OFF] cd.len=' + cd.length + ' aebi=' + aebi.map(a => a.length).join('/'));
  console.log('[OFF] scj:', JSON.stringify(scj).substring(0, 200));

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const env = buildEnv({ nsd: 67402, cd }, { target: TARGET, ua: UA, patchDyn: false });
  const sandbox = env.sandbox;

  // 注入 $_ts
  vm.runInContext('window.$_ts = window.$_ts || {};', sandbox);
  sandbox.$_ts = { nsd: 67402, cd, scj, aebi };
  sandbox.globalThis.$_ts = sandbox.$_ts;

  // 读取 dynCode（固定文本）
  let dynCode = fs.readFileSync('/tmp/nx_dynCode_captured_2.js', 'utf8');
  console.log('[OFF] dynCode len:', dynCode.length);

  // ★ 插桩
  let code = dynCode;
  // 1. 尾部标记
  code = code.replace(/\}\)\(_\$ts\.scj,_\$ts\.aebi\);\s*$/, ';globalThis.__TAIL_HIT=1;}($_ts.scj,$_ts.aebi);');
  // 2. _$dJ 插桩
  const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
  if (code.indexOf(dJPattern) >= 0) {
    code = code.replace(dJPattern, `function _$dJ(){try{globalThis.__DJ_HIT=(globalThis.__DJ_HIT||0)+1;if(globalThis.__DJ_HIT<=3){globalThis.__DJ_LOG=globalThis.__DJ_LOG||[];globalThis.__DJ_LOG.push(JSON.stringify({dpLen:_$dp.length,hhk:(_$hh&&_$hh._$ky)?Object.keys(_$hh._$ky).slice(0,10):null,g0k:(_$g0&&_$g0._$ky)?Object.keys(_$g0._$ky).slice(0,10):null}));}}catch(e){globalThis.__DJ_ERR=String(e);}}`);
    console.log('[OFF] _$dJ 插桩 OK');
  } else { console.log('[OFF] ✗ _$dJ 模式未找到'); }
  // 3. _$k6 dump
  const k6Mark = '_$k6=_$mD[5][_$oU[17]](';
  if (code.indexOf(k6Mark) >= 0) {
    code = code.replace(k6Mark, 'try{globalThis.__K6_SAVE=_$k6;}catch(e){}' + k6Mark);
    console.log('[OFF] _$k6 插桩 OK');
  }
  // 4. basearr 头检查（59/179）
  code = code.replace(/function _\$\$f\(_ \$_i\)/, ''); // no-op
  fs.writeFileSync('/tmp/nx_dynCode_offline_patched.js', code);
  console.log('[OFF] 已保存 patched len=' + code.length);

  // 执行
  const t0 = Date.now();
  try {
    const r = vm.runInContext(code, sandbox, { timeout: 60000, filename: 'dyn.js' });
    console.log('[OFF] dynCode 返回:', typeof r, r ? JSON.stringify(r).substring(0, 200) : '');
  } catch (e) {
    console.log('[OFF] dynCode 异常:', e.message.substring(0, 200));
    console.log('[OFF] stack:', e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : '');
  }
  console.log('[OFF] 执行耗时', Date.now() - t0, 'ms');

  for (const k of ['__TAIL_HIT', '__DJ_HIT', '__DJ_ERR', '__DJ_LOG', '__K6_SAVE']) {
    try {
      const v = vm.runInContext(`typeof ${k}!=='undefined'?${k}:null`, sandbox);
      if (typeof v === 'string') console.log('[OFF] ' + k + ':', v.substring(0, 500));
      else if (Array.isArray(v)) { console.log('[OFF] ' + k + ': array len=' + v.length); v.forEach((x, i) => console.log('[OFF]   #' + i + ':', x)); }
      else console.log('[OFF] ' + k + ':', JSON.stringify(v));
    } catch (e) { console.log('[OFF] ' + k + ' err:', e.message); }
  }
  process.exit(0);
})().catch(e => { console.error('[OFF] FATAL:', e.message); process.exit(1); });
