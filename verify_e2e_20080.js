/**
 * 端到端验证 — 拉 :20080 挑战页 → 沙箱提取动态代码/cp3 → 注入管线 → cookie 重放 200
 *
 * 这是「纯算法」管线的关键环节验证：证明只要 cp[3] 正确（沙箱提取），
 * 下游 cd解密→keys→basearr→cookie加密 能生成服务器接受的 cookie。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node verify_e2e_20080.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
require('module-alias')(path.dirname(require('./utils/paths').package));
const gv = require('@src/handler/globalVarible');
const { getCode } = require('@utils/');
const { runOuterVM } = require('./extract_dyncode_20080.js');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT_DIR = path.join(__dirname, 'output', 'capture-20080');
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(url, cookie) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': UA };
    if (cookie) headers['Cookie'] = cookie;
    https.get(url, { rejectUnauthorized: false, headers }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', (e) => resolve({ status: 'ERR', error: e.message }));
  });
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // 多次尝试（部分 nsd/cd 组合的 keys 结构异常导致管线失败，属已知边界）
  const MAX_TRIES = 6;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    console.log(`\n########## 尝试 ${attempt}/${MAX_TRIES} ##########`);
    const ok = await tryOnce();
    if (ok) { console.log('\n🎉🎉🎉 端到端打通：沙箱提取 cp3 + 管线 cookie → HTTP 200（真实业务页）'); process.exit(0); }
  }
  console.log('\n多次尝试均未 200，需进一步诊断');
  process.exit(1);

  async function tryOnce() {
  // ---- 1. 拉挑战页（412），拿 $_ts.nsd/cd + O cookie ----
  console.log('[1] 拉 :20080 挑战页...');
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.error('未找到 $_ts'); return false; }
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  console.log('    nsd=', nsd, 'cd_len=', cd.length, 'O=', oCookie && oCookie.substring(0, 26) + '...');

  // ---- 2. 沙箱提取动态代码 + cp3 ----
  console.log('[2] 沙箱提取 cp3...');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const vmResult = runOuterVM({ nsd, cd }, outerJsCode);
  console.log('    动态代码 len=', vmResult.dynLen, 'cp3=', vmResult.cp3);
  if (!vmResult.cp3) { console.error('沙箱未提取到'); return false; }

  // ---- 3. 管线生成 cookie ----
  console.log('[3] 管线生成 cookie...');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: vmResult.cp3 };
  fs.writeFileSync(path.join(OUT_DIR, 'e2e-ts.json'), JSON.stringify(ts));
  const argv = { file: path.join(OUT_DIR, 'e2e-ts.json'), jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: OUT_DIR, level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: !!gv.config.adapt?.hasDebug, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = vmResult.cp3;
  gv.config.codemap = codemap;

  let genCookie = null, cookieName = null, codeUid = null, diagErr = null;
  try {
    const cookieObj = new Cookie(coder);
    genCookie = cookieObj.run();
    codeUid = cookieObj.config.codeUid;
    cookieName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  } catch (e) { diagErr = e.message; }
  if (!genCookie) { console.error('    Cookie 生成失败:', diagErr); return false; }
  const k33 = +gv.utils.ascii2string(gv.keys[33]);
  const fnSortLen = coder.functionsNameSort.length;
  console.log('    cookie=', cookieName, 'len=', genCookie.length, '| codeUid=', codeUid, '| keys[33]=', k33, 'fnSort.len=', fnSortLen, 'k33越界=', !(k33 >= 0 && k33 < fnSortLen));

  // ---- 4. 重放 ----
  const cookieHeader = `${oCookie}; ${cookieName}=${genCookie}`;
  const replay = await httpGet(TARGET, cookieHeader);
  const okStat = replay.status === 200;
  const isChallenge = /\$_ts\.nsd=\d+;\$_ts\.cd="/.test(replay.body) && /\.303c6e9\.js|kmOJZ0KVxJ0R/.test(replay.body);
  const titleMatch = replay.body.match(/<title>([^<]*)<\/title>/);
  console.log('[4] 重放:', replay.status, '| 挑战页=', isChallenge, '| title=', titleMatch && titleMatch[1]);
  fs.writeFileSync(path.join(OUT_DIR, 'e2e-result.json'), JSON.stringify({ nsd, cp3: vmResult.cp3, codeUid, k33, fnSortLen, cookieName, cookieLen: genCookie.length, status: replay.status, isChallenge }, null, 2));
  return okStat && !isChallenge;
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
