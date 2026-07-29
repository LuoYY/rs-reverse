/**
 * 验证 keys 正确性自洽校验：对每次尝试，检查 keys[7] 是否为合法 cookie 名格式
 * （含 ';' 分隔、可打印 ASCII），并关联 200/412。
 * 若 412 集中对应 keys[7] 乱码 → 证实 keys 解密错误根因，且可用 keys[7] 校验 + genKeys step 重试修复到 100%。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_keys7_check.js [N]
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

// keys 自洽校验：keys[7] 应是 'name;..;..;..;..;..' 格式（≥5个;，段内可打印）
function keysValid(gv) {
  try {
    const s = gv.utils.ascii2string(gv.keys[7]);
    const parts = s.split(';');
    if (parts.length < 5) return { valid: false, reason: 'parts=' + parts.length, s: s.substring(0, 30) };
    // cookie 名段（idx5）应是字母数字
    const name = parts[5];
    if (!/^[A-Za-z0-9]{6,}$/.test(name)) return { valid: false, reason: 'badname=' + name, s: s.substring(0, 30) };
    // 全部可打印
    if (!/^[\x20-\x7e;]+$/.test(s)) return { valid: false, reason: 'nonprint', s: s.substring(0, 30) };
    return { valid: true, s };
  } catch (e) { return { valid: false, reason: 'err:' + e.message }; }
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
  const kv = keysValid(gv);
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const replay = await httpGet(TARGET, `${oCookie}; ${name}=${cookie}`);
  return { status: replay.status, kv, nsd };
}

(async () => {
  const N = parseInt(process.argv[2] || '20', 10);
  const rows = [];
  for (let i = 0; i < N; i++) {
    try {
      const r = await tryOnce();
      rows.push(r);
      console.log(`#${i + 1}: ${r.status} keys7=${r.kv.valid ? '合法✓' : '乱码✗(' + r.kv.reason + ')'} nsd=${r.nsd}`);
    } catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 40)}`); }
  }
  const ok = rows.filter(r => r.status === 200), bad = rows.filter(r => r.status !== 200);
  const okValid = ok.filter(r => r.kv.valid).length, okInvalid = ok.length - okValid;
  const badValid = bad.filter(r => r.kv.valid).length, badInvalid = bad.length - badValid;
  console.log(`\n===== ${ok.length}/${rows.length} 通过 =====`);
  console.log(`200 组: keys7合法 ${okValid}, 乱码 ${okInvalid}`);
  console.log(`412 组: keys7合法 ${badValid}, 乱码 ${badInvalid}`);
  if (badInvalid === bad.length && bad.length > 0 && okInvalid === 0) {
    console.log('✓✓ 完美相关：412 全部 keys7 乱码，200 全部 keys7 合法 → keys 根因证实，可用 keys7 校验+重试达 100%');
  } else if (badValid > 0) {
    console.log('✗ 存在 keys7 合法但仍 412 → keys 不是唯一根因');
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
