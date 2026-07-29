/**
 * 同 cd 确定性二分验证：固定 cd，生成管线 cookie 重放 10 次。
 * - 若全 200 或全 412 → 同 cd 确定（该 cd 的 keys/结构固定对错）→ keys 根因成立
 * - 若 200/412 混合 → 同 cd 内有随机因素 → 非 keys 根因
 *
 * 跑多个 cd（每个重放 8 次），统计每个 cd 是"全过/全不过/混合"。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_cd_determinism.js [CD数]
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

async function genPipeCookie(nsd, cd, cp3) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
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
  runRet.$_ts.cp[3] = cp3;
  gv.config.codemap = runRet.codemap;
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  return { cookie, name };
}

(async () => {
  const numCd = parseInt(process.argv[2] || '6', 10);
  const REPLAYS = 8;
  const summary = [];
  for (let c = 0; c < numCd; c++) {
    // 拉一次挑战页（新 cd + O）
    const ch = await httpGet(TARGET);
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) { console.log(`cd#${c + 1}: no ts`); continue; }
    const nsd = +m[1], cd = m[2];
    const setCookies = [].concat(ch.headers['set-cookie'] || []);
    const oCookie = setCookies.map(x => x.split(';')[0]).find(x => /O=/.test(x)) || setCookies.map(x => x.split(';')[0])[0];
    const { runOuterVM } = require('./extract_dyncode_20080.js');
    const r = runOuterVM({ nsd, cd }, outerJs);
    // 同 cd 生成一个管线 cookie，重放 REPLAYS 次
    const { cookie, name } = await genPipeCookie(nsd, cd, r.cp3);
    const header = `${oCookie}; ${name}=${cookie}`;
    let okCount = 0;
    const statuses = [];
    for (let i = 0; i < REPLAYS; i++) {
      const res = await httpGet(TARGET, header);
      statuses.push(res.status);
      if (res.status === 200) okCount++;
    }
    const kind = okCount === REPLAYS ? '全200' : okCount === 0 ? '全412' : `混合${okCount}/${REPLAYS}`;
    summary.push(kind);
    console.log(`cd#${c + 1} nsd=${nsd}: ${kind} [${statuses.join(',')}]`);
  }
  console.log(`\n===== 同 cd 重放确定性统计 =====`);
  const all200 = summary.filter(s => s === '全200').length;
  const all412 = summary.filter(s => s === '全412').length;
  const mixed = summary.filter(s => s.startsWith('混合')).length;
  console.log(`全200: ${all200}, 全412: ${all412}, 混合: ${mixed}`);
  if (mixed === 0) console.log('✓ 严格二分 → 同 cd 确定性，每个 cd 的 keys/结构固定对错 → keys(或cd派生结构)根因成立');
  else console.log(`✗ 存在混合 → 同 cd 内有随机因素，keys 根因不成立`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
