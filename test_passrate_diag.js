/**
 * 通过率诊断：每次尝试记录 cookie 生成时的随机字段，分析 200/412 与字段的相关性
 *
 * 背景：同一 cookie 重放结果确定（服务端确定性校验），但只有 ~25-33% cookie 通过。
 * 目标：找出通过与否取决于哪个可变字段。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_passrate_diag.js [N]
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

async function tryOnce() {
  // 1. 挑战页
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('no $_ts, status=' + ch.status);
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];

  // 2. 沙箱 cp3
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  if (!r.cp3) throw new Error('no cp3');

  // 3. 管线 cookie（捕获运行时配置）
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
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

  // 捕获运行时可变字段
  const rt = gv.makecookieRuntimeConfig || {};
  const captured = {
    execNumberByTime: rt.execNumberByTime,
    random: rt.random,
    currentTime: rt.currentTime,
    runTime: rt.runTime,
    startTime: rt.startTime,
    r2mkaTime: gv.config.r2mkaTime,
    codeUid: gv.config.codeUid,
  };

  // 4. 重放
  const header = `${oCookie}; ${name}=${cookie}`;
  const replay = await httpGet(TARGET, header);
  return { status: replay.status, nsd, cp3: r.cp3, ...captured, cookieLen: cookie.length };
}

async function main() {
  const n = parseInt(process.argv[2] || '30', 10);
  const rows = [];
  for (let i = 0; i < n; i++) {
    try {
      const row = await tryOnce();
      rows.push(row);
      console.log(`#${i + 1}: ${row.status} execN=${row.execNumberByTime} random=${row.random === null ? 'null' : row.random} r2mka=${row.r2mkaTime} codeUid=${row.codeUid} dTime=${row.currentTime - row.startTime * 1000}`);
    } catch (e) {
      console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 60)}`);
    }
  }
  // 相关性分析
  const ok = rows.filter(r => r.status === 200);
  const bad = rows.filter(r => r.status !== 200);
  console.log(`\n===== 统计: ${ok.length}/${rows.length} 通过 (${(ok.length / rows.length * 100).toFixed(1)}%) =====`);
  const stat = (arr, k) => arr.length ? { min: Math.min(...arr.map(r => r[k])), max: Math.max(...arr.map(r => r[k])), avg: (arr.reduce((s, r) => s + r[k], 0) / arr.length).toFixed(1) } : {};
  for (const k of ['execNumberByTime', 'currentTime', 'r2mkaTime', 'codeUid', 'cookieLen']) {
    console.log(`${k}: 200组=${JSON.stringify(stat(ok, k))} 412组=${JSON.stringify(stat(bad, k))}`);
  }
  // nsd 与 200 的关联分析（验证服务端是否按 nsd 白名单 codeUid）
  const okNsds = ok.map(r => r.nsd), badNsds = bad.map(r => r.nsd);
  console.log(`\n200 组 nsd: ${JSON.stringify(okNsds)}`);
  console.log(`412 组 nsd 样本: ${JSON.stringify(badNsds.slice(0, 20))}`);
  console.log(`200 组 cp3: ${JSON.stringify(ok.map(r => r.cp3))}`);
  console.log(`200 组唯一 nsd 数: ${new Set(okNsds).size}/${okNsds.length}, 412 组唯一 nsd 数: ${new Set(badNsds).size}/${badNsds.length}`);
  // nsd 奇偶/区间分布
  const nsdParity = (arr) => `${arr.filter(x => x % 2 === 0).length}偶/${arr.filter(x => x % 2 === 1).length}奇`;
  console.log(`nsd 奇偶: 200组 ${nsdParity(okNsds)} | 412组 ${nsdParity(badNsds)}`);
  console.log(`nsd 范围: 200组 [${Math.min(...okNsds)},${Math.max(...okNsds)}] | 412组 [${Math.min(...badNsds)},${Math.max(...badNsds)}]`);
  // execNumberByTime 奇偶/区间分布
  const parity = (arr) => `${arr.filter(r => r.execNumberByTime % 2 === 0).length}偶/${arr.filter(r => r.execNumberByTime % 2 === 1).length}奇`;
  console.log(`execNumberByTime 奇偶: 200组 ${parity(ok)} | 412组 ${parity(bad)}`);
  fs.writeFileSync('/tmp/passrate_diag.json', JSON.stringify(rows, null, 2));
  console.log('明细已存 /tmp/passrate_diag.json');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
