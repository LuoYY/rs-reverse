/**
 * 验证 keys[21]（r2mkaTime 来源）与 keys[22]/keys[24] 等加密关键 keys 在 200/412 cd 间的差异。
 * 重点：keys[21] 是否非法数字（NaN → r2mkaTime=NaN → numToNumarr4 出错 → 加密损坏）。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_keys21_check.js [N]
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJs = fs.readFileSync(OUTER_JS, 'utf8');

let _got = null;
async function gotScraping() {
  if (!_got) {
    const { gotScraping } = await import('got-scraping');
    _got = gotScraping.extend({
      headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 131, maxVersion: 131 }], devices: ['desktop'], operatingSystems: ['macos'] },
      https: { rejectUnauthorized: false }, timeout: { request: 15000 }, retry: { limit: 0 }, throwHttpErrors: false,
    });
  }
  return _got;
}
async function httpGet(url, cookie) {
  const g = await gotScraping();
  const headers = { 'User-Agent': UA };
  if (cookie) headers['Cookie'] = cookie;
  const res = await g.get(url, { headers });
  return { status: res.statusCode, headers: res.headers, body: res.body };
}

async function tryOnce() {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('no ts');
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJs);
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/t.json', JSON.stringify(ts));
  const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const runRet = coder.run();
  runRet.$_ts.cp[3] = r.cp3;
  gv.config.codemap = runRet.codemap;
  const cookie = new Cookie(coder).run();

  // 提取关键 keys 的可读性与数值合法性
  const k21 = gv.utils.ascii2string(gv.keys[21]);
  const k21num = +k21;
  const k22 = gv.utils.ascii2string(gv.keys[22]);
  const k24 = gv.utils.ascii2string(gv.keys[24]);
  const k33 = gv.utils.ascii2string(gv.keys[33]);
  const k34 = gv.utils.ascii2string(gv.keys[34]);
  const k19 = gv.utils.ascii2string(gv.keys[19]);

  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const replay = await httpGet(TARGET, `${oCookie}; ${name}=${cookie}`);
  return {
    status: replay.status, nsd,
    k21, k21valid: !isNaN(k21num) && isFinite(k21num),
    k22, k24, k33, k34, k19,
  };
}

(async () => {
  const N = parseInt(process.argv[2] || '20', 10);
  const rows = [];
  for (let i = 0; i < N; i++) {
    try {
      const r = await tryOnce();
      rows.push(r);
      console.log(`#${i + 1}: ${r.status} k21=${r.k21}(${r.k21valid ? 'ok' : 'NaN!'}) k19=${r.k19} k24=${r.k24} k33=${r.k33} k34=${r.k34}`);
    } catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 40)}`); }
  }
  const ok = rows.filter(r => r.status === 200), bad = rows.filter(r => r.status !== 200);
  console.log(`\n===== ${ok.length}/${rows.length} 通过 =====`);
  for (const key of ['k21valid']) {
    console.log(`${key}: 200组=${ok.filter(r => r[key]).length}/${ok.length} 合法, 412组=${bad.filter(r => r[key]).length}/${bad.length} 合法`);
  }
  console.log('200 组 k21:', ok.map(r => r.k21));
  console.log('412 组 k21:', bad.map(r => r.k21));
  console.log('200 组 k19:', ok.map(r => r.k19));
  console.log('412 组 k19:', bad.map(r => r.k19));
  // k22 长度（[6]段 encryptMode2 依赖）
  console.log('200 组 k22 len:', ok.map(r => r.k22.length));
  console.log('412 组 k22 len:', bad.map(r => r.k22.length));
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
