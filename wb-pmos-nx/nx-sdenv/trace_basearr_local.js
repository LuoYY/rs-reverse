// 用 sandbox_keygen + 本地固定 challenge（nsd=67402）跑 nx 外层 VM，截获 dynCode 并插桩
// 本地固定 challenge → dynCode 文本固定 → 可静态插桩反编译
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  // 本地固定 challenge 数据（nsd=67402, cd 固定）
  const ch = JSON.parse(fs.readFileSync('/tmp/nx_local_challenge.json', 'utf8'));
  const nsd = ch.nsd, cd = ch.cd;
  console.log('[LOC] nsd=' + nsd + ' cdLen=' + cd.length);

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

  // patchDyn=false 让 Proxy eval 截获 dynCode 到 env
  const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false, timeout: 60000, waitMs: 0 });
  const sandbox = env.sandbox;

  const t0 = Date.now();
  try { vm.runInContext(outerJsCode, sandbox, { timeout: 55000, filename: 'outer.js' }); }
  catch (e) { console.log('[LOC] outer 异常:', e.message.substring(0, 100)); }

  const dynCode = env.getDynCode();
  console.log('[LOC] dynCode len:', dynCode ? dynCode.length : 0);
  if (!dynCode) { console.log('[LOC] 无 dynCode, errors:', env.captured.errors.slice(0, 3)); process.exit(0); }

  // ★ 插桩 dynCode（文本固定，可重复替换）
  let code = dynCode;
  const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
  if (code.indexOf(dJPattern) >= 0) {
    code = code.replace(dJPattern, `function _$dJ(){try{globalThis.__DJ_HIT=(globalThis.__DJ_HIT||0)+1;if(globalThis.__DJ_HIT<=3){globalThis.__DJ_LOG=globalThis.__DJ_LOG||[];globalThis.__DJ_LOG.push(JSON.stringify({dpLen:_$dp.length,hhk:(_$hh&&_$hh._$ky)?Object.keys(_$hh._$ky).slice(0,10):null,g0k:(_$g0&&_$g0._$ky)?Object.keys(_$g0._$ky).slice(0,10):null}));}}catch(e){globalThis.__DJ_ERR=String(e);}}`);
    console.log('[LOC] _$dJ 插桩 OK');
  } else { console.log('[LOC] ✗ _$dJ 模式未找到'); }

  // dump _$k6（动态 JS 代码）
  const k6Mark = '_$k6=_$mD[5][_$oU[17]](';
  if (code.indexOf(k6Mark) >= 0) {
    code = code.replace(k6Mark, 'try{globalThis.__K6_SAVE=_$k6;}catch(e){}' + k6Mark);
    console.log('[LOC] _$k6 插桩 OK');
  }
  // 尾部标记
  code = code.replace(/\}\)\(_\$ts\.scj,_\$ts\.aebi\);\s*$/, ';globalThis.__TAIL_HIT=1;}($_ts.scj,$_ts.aebi);');
  fs.writeFileSync('/tmp/nx_dynCode_local_patched.js', code);
  console.log('[LOC] 已保存 patched len=' + code.length);

  // 执行插桩版 dynCode
  try {
    vm.runInContext(code, sandbox, { timeout: 55000, filename: 'dyn_patched.js' });
    console.log('[LOC] dynCode 执行完成');
  } catch (e) {
    console.log('[LOC] dynCode 异常:', e.message.substring(0, 150));
  }
  await new Promise(r => setTimeout(r, 12000));

  for (const k of ['__TAIL_HIT', '__DJ_HIT', '__DJ_ERR', '__DJ_LOG', '__K6_SAVE']) {
    try {
      const v = vm.runInContext(`typeof ${k}!=='undefined'?${k}:null`, sandbox);
      if (typeof v === 'string') console.log('[LOC] ' + k + ':', v.substring(0, 600));
      else if (Array.isArray(v)) { console.log('[LOC] ' + k + ': array'); v.forEach((x, i) => console.log('[LOC]   #' + i + ':', x)); }
      else console.log('[LOC] ' + k + ':', JSON.stringify(v));
    } catch (e) { console.log('[LOC] ' + k + ' err:', e.message); }
  }
  console.log('[LOC] cookies:', env.captured.cookies.length, env.captured.cookies.map(c => c.split(';')[0]).slice(-3));
  console.log('[LOC] 耗时', Date.now() - t0, 'ms');
  process.exit(0);
})().catch(e => { console.error('[LOC] FATAL:', e.message); process.exit(1); });
