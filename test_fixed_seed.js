/**
 * 终极定位：固定 nsd/cd（一次挑战页）+ 冻结 Math.random/Date.now →
 * 同种子下管线 basearr 应完全确定。生成 1 个 cookie 重放 N 次验证确定性，
 * 再用同种子生成 K 个不同 execN/time/random8 组合的 cookie 分别重放，看哪些组合过。
 *
 * 关键：同 nsd 下若管线能生成"通过明文"也能生成"被拒明文"，则差异只在 execN/time/random8。
 * 冻结这三个 → 同 nsd 下 basearr 唯一 → 重放结果确定（要么全过要么全不过）。
 * 若冻结后同 nsd 必过 → 100% 通过率可通过"冻结到通过值"实现。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_fixed_seed.js
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
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(16); }

const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

async function genCookie(nsd, cd, cp3, freezeTime) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  if (freezeTime) {
    Math.random = () => 0.5;
    const FIXED = 1785167000000;
    Date.now = () => FIXED;
  }
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
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
  fullTs.cp[3] = cp3;
  gv.config.codemap = codemap;
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  return { cookie, name };
}

async function main() {
  // 1. 一次挑战页固定种子
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.error('no $_ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  console.log(`固定种子 nsd=${nsd} cp3=${r.cp3}`);

  // 2. 冻结时间 → 同种子生成 5 个 cookie，验证是否全同（完全确定）
  console.log('\n[2] 冻结 random+time，同种子生成 5 个 cookie:');
  const frozenCookies = [];
  for (let i = 0; i < 5; i++) {
    const { cookie, name } = await genCookie(nsd, cd, r.cp3, true);
    frozenCookies.push({ cookie, name });
    console.log(`  #${i + 1} hash=${hash(cookie)}`);
  }
  const uniqFrozen = new Set(frozenCookies.map(c => hash(c.cookie)));
  console.log(`  唯一 cookie: ${uniqFrozen.size}/5 ${uniqFrozen.size === 1 ? '✓ 完全确定' : '✗ 仍有随机源'}`);

  // 3. 用冻结 cookie 重放 6 次，看结果是否确定
  const { cookie: fc, name: fn } = frozenCookies[0];
  const fHeader = `${oCookie}; ${fn}=${fc}`;
  console.log('\n[3] 冻结 cookie 重放 6 次:');
  let fOk = 0;
  for (let i = 0; i < 6; i++) {
    const res = await httpGet(TARGET, fHeader);
    if (res.status === 200) fOk++;
    console.log(`  #${i + 1}: ${res.status}`);
  }
  console.log(`  → ${fOk}/6 200 ${fOk === 6 ? '✓ 该确定明文必过' : fOk === 0 ? '✗ 该确定明文必被拒' : '⚠ 非确定（有其他因素）'}`);

  // 4. 同种子 P + 【每次新拉 O】，验证 O 时效性假设
  console.log('\n[4] 同种子 P（固定 nsd 生成）+ 每次新拉挑战页取新 O，8 次:');
  const { cookie: fixedP, name: fixedName } = await genCookie(nsd, cd, r.cp3, false);
  let ok4 = 0;
  for (let i = 0; i < 8; i++) {
    const ch2 = await httpGet(TARGET); // 新挑战页 → 新 O
    const sc2 = [].concat(ch2.headers['set-cookie'] || []);
    const o2 = sc2.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc2.map(c => c.split(';')[0])[0];
    const header = `${o2}; ${fixedName}=${fixedP}`;
    const res = await httpGet(TARGET, header);
    if (res.status === 200) ok4++;
    console.log(`  #${i + 1}: ${res.status} (新O+固定P)`);
  }
  console.log(`  → ${ok4}/8 200 （新 O + 固定 P 的通过率）`);

  // 5. 对照：同挑战页 O+P（完整新鲜流程）
  console.log('\n[5] 对照：每次完整新鲜流程（新 O + 新 P 同种子），8 次:');
  let ok5 = 0;
  for (let i = 0; i < 8; i++) {
    const ch3 = await httpGet(TARGET);
    const m3 = ch3.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m3) { console.log(`  #${i + 1}: 挑战页无 ts`); continue; }
    const sc3 = [].concat(ch3.headers['set-cookie'] || []);
    const o3 = sc3.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc3.map(c => c.split(';')[0])[0];
    const r3 = runOuterVM({ nsd: +m3[1], cd: m3[2] }, outerJsCode);
    const { cookie: p3, name: n3 } = await genCookie(+m3[1], m3[2], r3.cp3, false);
    const res = await httpGet(TARGET, `${o3}; ${n3}=${p3}`);
    if (res.status === 200) ok5++;
    console.log(`  #${i + 1}: ${res.status}`);
  }
  console.log(`  → ${ok5}/8 200 （完整新鲜流程通过率）`);
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
