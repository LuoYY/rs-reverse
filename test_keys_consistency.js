/**
 * 验证清 require.cache 是否导致 keys16 解密不稳定：
 * 固定 cd，连续 2 次跑管线（清缓存），对比 keys16 是否一致。
 * 再固定 cd，不清缓存跑第 2 次（若 gv 污染会报错，但可看 keys）。
 *
 * 更直接：固定 cd，清缓存跑 5 次，看 keys16/17/2 是否每次都一致。
 * 若不一致 → 清缓存导致解密不稳定 → 这就是 412 根因（offset 受残留/初始化顺序影响）。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_keys_consistency.js
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

function httpGet(url) {
  return new Promise(r => {
    https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ body: b, headers: res.headers }));
    }).on('error', () => r({ body: '', headers: {} }));
  });
}

(async () => {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJs);
  console.log('固定 nsd=', nsd, 'cp3=', r.cp3);

  const keysArr = [];
  for (let t = 0; t < 5; t++) {
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
    new Cookie(coder).run(); // init keys
    keysArr.push({
      k2: JSON.stringify(gv.keys[2]),
      k16: JSON.stringify(gv.keys[16]),
      k17: JSON.stringify(gv.keys[17]),
      offset: JSON.stringify(gv.dynamicTaskOffset || null),
    });
    console.log(`#${t + 1}: k16[0:6]=${gv.keys[16].slice(0, 6).join(',')} k17[0:6]=${gv.keys[17].slice(0, 6).join(',')} offset=${JSON.stringify(gv.dynamicTaskOffset)}`);
  }
  console.log('\n===== keys 一致性 =====');
  console.log('k2 全同?', new Set(keysArr.map(k => k.k2)).size === 1);
  console.log('k16 全同?', new Set(keysArr.map(k => k.k16)).size === 1);
  console.log('k17 全同?', new Set(keysArr.map(k => k.k17)).size === 1);
  console.log('offset 全同?', new Set(keysArr.map(k => k.offset)).size === 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
