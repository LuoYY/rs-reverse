/**
 * 追求 100% 通过率：逐项冻结管线中的随机源（Math.random），定位服务端校验的随机字段。
 *
 * 原理：管线 cookie 的随机性全部来自 Math.random（execN/encryptMode2 IV/random8/numarrAddTime ele）。
 * 服务端确定性校验 → 必校验某个随机字段。冻结全部 Math.random=定值 → basearr 完全确定 →
 * 若此时 100% 通过（或 100% 失败），则证明随机字段是被校验对象；再逐项解冻定位。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_freeze_random.js [mode] [N]
 *   mode: freeze(冻结全部) | normal(对照) | freeze-seed(固定种子序列)
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

const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
const mode = process.argv[2] || 'freeze';

// 冻结 Math.random 为固定值 0.5（每次调用恒返回 0.5 → 所有随机字段确定）
if (mode === 'freeze') {
  Math.random = () => 0.5;
  console.log('[freeze] Math.random 冻结为 0.5');
} else if (mode === 'freeze-seed') {
  let seed = 12345;
  Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  console.log('[freeze-seed] Math.random 固定 LCG 序列');
} else if (mode === 'freeze-time') {
  Math.random = () => 0.5;
  const FIXED = 1785167000000; // 固定时间戳
  const _now = Date.now;
  Date.now = () => FIXED;
  // new Date().getTime() 也需冻结
  const _Date = Date;
  global.Date = class extends _Date {
    constructor(...a) { super(); return a.length ? new _Date(...a) : new _Date(FIXED); }
    static now() { return FIXED; }
  };
  console.log('[freeze-time] Math.random=0.5 + Date.now 冻结为', FIXED);
} else {
  console.log('[normal] 对照组，Math.random 原生');
}

async function tryOnce() {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('no $_ts');
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  if (!r.cp3) throw new Error('no cp3');
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
  const header = `${oCookie}; ${name}=${cookie}`;
  const replay = await httpGet(TARGET, header);
  return { status: replay.status, cookie, header };
}

async function main() {
  const n = parseInt(process.argv[3] || '15', 10);
  let ok = 0;
  const cookies = [];
  for (let i = 0; i < n; i++) {
    try {
      const r = await tryOnce();
      cookies.push(r.cookie);
      if (r.status === 200) ok++;
      console.log(`#${i + 1}: ${r.status} cookie_hash=${hash(r.cookie)}`);
    } catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 50)}`); }
  }
  console.log(`\n===== mode=${mode}: ${ok}/${n} 通过 (${(ok / n * 100).toFixed(1)}%) =====`);
  const uniq = new Set(cookies.map(hash));
  console.log(`唯一 cookie 数: ${uniq.size}/${cookies.length} ${uniq.size === 1 ? '(完全确定→服务端校验该明文)' : '(仍有随机)'}`);
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(16); }
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
