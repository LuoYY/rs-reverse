/**
 * codeUid 修正验证：对一个 cd，遍历 functionsNameSort 所有索引重算 codeUid，
 * 注入 basearr(codeUidOverride) 生成 cookie，重放测哪个 codeUid 能 200。
 * 若存在某索引使 200 → 证明管线 funcIdx/函数提取错误，且能找到正确 codeUid → 100% 通过率。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_codeuid_brute.js
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const https = require('https');

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

(async () => {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.error('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJs);
  console.log('固定 nsd=', nsd, 'cp3=', r.cp3);

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const parser = require('@src/handler/parser/');
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

  // 先确认该 cd 默认 codeUid 重放是否 412（若是 200 则换个 cd）
  const ck0 = new Cookie(coder);
  const c0 = ck0.run();
  const defCodeUid = ck0.getCodeUid();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const defReplay = await httpGet(TARGET, `${oCookie}; ${name}=${c0}`);
  console.log(`默认 codeUid=0x${defCodeUid.toString(16)} 重放=${defReplay.status}`);

  // 计算所有候选 codeUid（遍历 functionsNameSort 索引）
  const mainFunctionCode = coder.code.slice(...coder.mainFunctionIdx);
  const keys34 = +gv.utils.ascii2string(gv.keys[34]) || 0;
  const len = parseInt(mainFunctionCode.length / 100);
  const start = len * keys34;
  const two = parser.uuid(mainFunctionCode.substr(start, len));
  console.log(`functionsNameSort 数量=${coder.functionsNameSort.length}, two(uuid main.substr)=0x${two.toString(16)}`);

  const candidates = [];
  for (let idx = 0; idx < coder.functionsNameSort.length; idx++) {
    const entry = coder.functionsNameSort[idx];
    if (!entry || !entry.code) continue;
    const one = parser.uuid(entry.code);
    const codeUid = (one ^ two) & 65535;
    candidates.push({ idx, codeUid, name: entry.name });
  }
  console.log(`候选 codeUid 数=${candidates.length}（去重后 ${new Set(candidates.map(c => c.codeUid)).size}）`);

  // 注入 codeUidOverride 生成 cookie 并重放（用 makecookieRuntimeConfig.codeUid）
  // 由于 gv.makecookieRuntimeConfig 可注入 codeUid，Cookie 构造时 this.config.codeUid 优先
  const uniqCodeUids = [...new Set(candidates.map(c => c.codeUid))];
  let found = null;
  for (const cu of uniqCodeUids) {
    // 重新生成（清缓存）但注入 codeUid
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require('./utils/paths').package));
    const gv2 = require('@src/handler/globalVarible');
    const { getCode: gc2 } = require('@utils/');
    gv2._setAttr('makecookieRuntimeConfig', { codeUid: cu }); // 注入候选 codeUid
    const ts2 = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
    fs.writeFileSync('/tmp/t.json', JSON.stringify(ts2));
    const argv2 = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
    const codeRet2 = await gc2(argv2.jsurls);
    argv2.mate = { jscode: codeRet2.jscode, metaContent: [], url: undefined };
    gv2._setAttr('argv', argv2);
    require('@src/config/')(gv2);
    gv2._setAttr('_ts', ts2);
    const Coder2 = require('@src/handler/Coder');
    const Cookie2 = require('@src/handler/Cookie');
    const coder2 = new Coder2({ hasCodemap: true, hasDebug: false, ...ts2 }, gv2.config.immucfg);
    const rr2 = coder2.run();
    rr2.$_ts.cp[3] = r.cp3;
    gv2.config.codemap = rr2.codemap;
    const cookie2 = new Cookie2(coder2).run();
    const name2 = gv2.utils.ascii2string(gv2.keys[7]).split(';')[5] + (gv2.config.adapt?.lastWord || 'T');
    const replay = await httpGet(TARGET, `${oCookie}; ${name2}=${cookie2}`);
    const mark = replay.status === 200 ? ' ✓✓✓' : '';
    if (replay.status === 200) found = cu;
    console.log(`  codeUid=0x${cu.toString(16)} → ${replay.status}${mark}`);
    if (found !== null && replay.status === 200) { /* 继续看是否多个 */ }
  }
  console.log(`\n===== 结果: 默认=0x${defCodeUid.toString(16)}(${defReplay.status}) =====`);
  if (found !== null) console.log(`✓ 找到能通过的正确 codeUid=0x${found.toString(16)} → 证明管线 funcIdx 算错，可用正确 codeUid 达 100%`);
  else console.log(`✗ 所有候选 codeUid 均 412 → codeUid 不是根因（或正确 codeUid 不在 functionsNameSort 中）`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
