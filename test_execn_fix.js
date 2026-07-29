/**
 * 验证假设：execNumberByTime 固定为 1（奇数、贴近真实浏览器值）能否让通过率 → ~100%
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_execn_fix.js [N]
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

let _got = null;
async function gotScraping() {
  if (!_got) {
    const { gotScraping } = await import('got-scraping');
    _got = gotScraping.extend({
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 131, maxVersion: 131 }],
        devices: ['desktop'],
        operatingSystems: ['macos'],
      },
      https: { rejectUnauthorized: false },
      timeout: { request: 15000 },
      retry: { limit: 0 },
      throwHttpErrors: false,
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

const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

async function tryOnce(execN) {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('no $_ts, status=' + ch.status);
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];

  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  if (!r.cp3) throw new Error('no cp3');

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  // ★ 注入固定 execNumberByTime
  gv._setAttr('makecookieRuntimeConfig', { execNumberByTime: execN });
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/pmos-xj-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/pmos-xj-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = r.cp3;
  gv.config.codemap = codemap;
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');

  const header = `${oCookie}; ${name}=${cookie}`;
  const replay = await httpGet(TARGET, header);
  return replay.status;
}

async function main() {
  const n = parseInt(process.argv[2] || '20', 10);
  const execN = parseInt(process.argv[3] || '1', 10);
  let ok = 0;
  for (let i = 0; i < n; i++) {
    try {
      const st = await tryOnce(execN);
      if (st === 200) ok++;
      console.log(`#${i + 1}: ${st}`);
    } catch (e) {
      console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 50)}`);
    }
  }
  console.log(`\n===== execNumberByTime=${execN}: ${ok}/${n} 通过 (${(ok / n * 100).toFixed(1)}%) =====`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
