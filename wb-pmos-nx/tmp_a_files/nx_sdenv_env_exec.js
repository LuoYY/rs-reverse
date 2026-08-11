// 用 buildEnv（Phase4 验证过的完整沙箱环境）直接执行 nx dynCode
// 关键：buildEnv 提供真实环境值（document/navigator/chrome/反检测补丁/Z8XHJJY）→ 环境检测通过 → 自包含初始化 pool
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  // 捕获的完整 $_ts + dynCode
  const ts = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_ts_full2.json'), 'utf8'));
  let dynCode = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');
  console.log('[SE] dynCode len:', dynCode.length);

  // 构建 buildEnv 环境（nx 站点参数）
  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, {
    target: B + '/',
    ua: UA,
    patchDyn: false,
    debugLog: false,
  });
  const sandbox = env.sandbox;
  const captured = env.captured;

  // 覆盖完整 $_ts（buildEnv 只放了 nsd/cd，nx dynCode 需要全字段）
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  // 捕获 kt 最终值
  const ktGetter = `window.__ktFinal = (typeof _$kt !== 'undefined') ? _$kt.slice(0) : null;`;
  // dynCode 尾部标记
  dynCode = dynCode.replace(/\}\)\(_ \$\$5,_\$lP\);\s*$/, ktGetter + ';}($_$$5,$_$lP);');
  dynCode = dynCode.replace(/\}\)\(_\$ts\.scj,_\$ts\.aebi\);\s*$/, ktGetter + ';}($_ts.scj,$_ts.aebi);');
  // 找不到尾部就用通用 IIFE 收尾替换
  if (dynCode.indexOf('__ktFinal') < 0) {
    const tailMark = 'window.__dynTail=true;';
    dynCode = dynCode + '\n' + tailMark;
  }

  console.log('[SE] 开始执行 dynCode (buildEnv 沙箱)...');
  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[SE] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[SE] 执行错误:', e.message);
    console.log('[SE] 栈:', (e.stack || '').split('\n').slice(0, 8).join('\n[SE]   '));
  }

  // 检查 kt 最终值
  try {
    const kt = vm.runInContext('typeof __ktFinal!=="undefined"?__ktFinal:null', sandbox);
    if (kt) console.log('[SE] ★ ktFinal len=' + kt.length + ' head=' + kt.slice(0, 12).join(','));
    else console.log('[SE] ktFinal 未捕获');
  } catch (e) { console.log('[SE] ktFinal 读取失败:', e.message); }

  // 检查状态
  for (const k of ['__dynTail', '__ktFinal']) {
    try {
      const v = vm.runInContext(`typeof ${k}!=='undefined'?${k}:null`, sandbox);
      console.log('[SE] ' + k + ':', typeof v === 'object' && v ? ('len=' + v.length) : JSON.stringify(v));
    } catch (e) {}
  }
  console.log('[SE] cookies:', captured.cookies.length);
  console.log('[SE] errors:', captured.errors.slice(-5));
  console.log('[SE] missing:', [...new Set(captured.missing)].slice(0, 20));
  process.exit(0);
})().catch(e => { console.error('[SE] FATAL:', e.message); process.exit(1); });
