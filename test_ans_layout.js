/**
 * 验证 ans 的 keys 布局是否随 cd 变：
 * 跑多个 cd，记录 ans[0]（keys 数量）和 keys[16] 的值。
 * - 若 ans[0] 变 且 keys[16] 变 → keys 布局随 cd 变，硬编码 keys[16] 可能错
 * - 若 ans[0] 恒定 但 keys[16] 恒定 → keys16 是固定位置的固定值（站点常量 or genKeys 切到固定区）
 *
 * 关键：keys16 恒定 = [21,144,...]。需确认这是否等于【服务器真实 keys16】。
 * 方法：用管线 keys16 反解真实 P（该 cd 的），若外层能解 → keys16 对。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_ans_layout.js [N]
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

function httpGet(url, cookie) {
  return new Promise(r => {
    const headers = { 'User-Agent': UA };
    if (cookie) headers['Cookie'] = cookie;
    https.get(url, { rejectUnauthorized: false, headers }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', () => r({ status: 'ERR', body: '', headers: {} }));
  });
}

(async () => {
  const N = parseInt(process.argv[2] || '10', 10);
  const layouts = [];
  for (let i = 0; i < N; i++) {
    const ch = await httpGet(TARGET);
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) continue;
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
    const pipeCookie = new Cookie(coder).run();
    const pipeName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
    const replay = await httpGet(TARGET, `${oCookie}; ${pipeName}=${pipeCookie}`);

    const decrypt = require('@src/handler/parser/common/decrypt');
    const cdArr = decrypt(gv.ts.cd);
    const end = (cdArr[0] << 8 | cdArr[1]) + 2;
    const offset = gv._getAttr('dynamicTaskOffset');
    const ans = cdArr.slice(end).map((item, idx) => item ^ offset[idx % 8]);
    const keyLens = gv.keys.map(k => k.length);
    layouts.push({ nsd, status: replay.status, ans0: ans[0], k17: gv.keys[17].join(','), keyLensKey: keyLens.join(','), k17len: gv.keys[17].length });
    console.log(`#${i + 1}: ${replay.status} nsd=${nsd} k17len=${gv.keys[17].length} keyLens=${keyLens.slice(0, 12).join(',')}`);
  }
  console.log('\n===== 布局与通过率关联 =====');
  const ok = layouts.filter(l => l.status === 200), bad = layouts.filter(l => l.status !== 200);
  console.log(`200: ${ok.length}, 412: ${bad.length}`);
  const okLayouts = [...new Set(ok.map(l => l.keyLensKey))];
  const badLayouts = [...new Set(bad.map(l => l.keyLensKey))];
  console.log(`200 布局数: ${okLayouts.length}, 412 布局数: ${badLayouts.length}`);
  console.log(`200 组 k17len: ${[...new Set(ok.map(l => l.k17len))]}`);
  console.log(`412 组 k17len: ${[...new Set(bad.map(l => l.k17len))]}`);
  // 每种布局的通过率
  const byLayout = {};
  for (const l of layouts) { (byLayout[l.keyLensKey] = byLayout[l.keyLensKey] || { ok: 0, bad: 0 }); if (l.status === 200) byLayout[l.keyLensKey].ok++; else byLayout[l.keyLensKey].bad++; }
  console.log('各布局 200/412:');
  for (const [k, v] of Object.entries(byLayout)) console.log(`  [${k.substring(0, 40)}...]: 200=${v.ok} 412=${v.bad}`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
