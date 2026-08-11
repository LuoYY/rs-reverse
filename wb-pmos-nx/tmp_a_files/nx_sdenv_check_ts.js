// 验证 buildEnv 中 window['$_ts'] 和 window['$_ts'].jf 可用性
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const ts = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_ts_full2.json'), 'utf8'));
  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };
  sandbox.globalThis.$_ts = sandbox.$_ts;
  sandbox.window.$_ts = sandbox.$_ts;

  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[CK] window.$_ts:', q('typeof window.$_ts'));
  console.log('[CK] window["$_ts"]:', q('typeof window["$_ts"]'));
  console.log('[CK] window["$_ts"].jf:', q('typeof window["$_ts"].jf !== "undefined" ? String(window["$_ts"].jf).slice(0,30) : "undef"'));
  console.log('[CK] _$a2["$_ts"]:', q('typeof _$a2 !== "undefined" ? typeof _$a2["$_ts"] : "no a2"'));
  process.exit(0);
})().catch(e => { console.error('[CK] FATAL:', e.message); process.exit(1); });
