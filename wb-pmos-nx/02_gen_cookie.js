/**
 * 02_gen_cookie.js
 *
 * 管线生成 nx 站点 cookie 并重放验证：
 *   拉挑战 → cp3 → 管线 Cookie → 带 O+P 重放 /
 *
 * 用法：node 02_gen_cookie.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

function httpGet(url, cookie) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'GET',
      rejectUnauthorized: false,
      headers: { 'User-Agent': UA, 'Accept': '*/*', ...(cookie ? { Cookie: cookie } : {}) },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
    req.end();
  });
}

async function main() {
  console.log('=== nx 站点 cookie 生成测试 ===\n');

  // 1. 拉挑战页
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无挑战页:', ch.status, ch.body.substring(0, 100)); return; }
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  console.log('[1] nsd=' + nsd + ' cdLen=' + cd.length);
  console.log('    O=' + oCookie.substring(0, 40) + '...');

  // 2. cp3
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  if (!r.cp3) { console.log('cp3 提取失败'); return; }
  console.log('[2] cp3=' + r.cp3 + ' dynLen=' + r.dynLen);

  // 3. 管线生成 cookie
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
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
  console.log('[3] cookie: ' + name + ' len=' + cookie.length);
  console.log('    keys[7] = ' + gv.utils.ascii2string(gv.keys[7]));
  console.log('    keys16 = ' + gv.keys[16].map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('    keys17 = ' + gv.keys[17].map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 4. 重放
  const header = `${oCookie}; ${name}=${cookie}`;
  const replay = await httpGet(TARGET, header);
  console.log('\n[4] 重放 / →', replay.status, 'len=' + replay.body.length);
  if (replay.status === 200) {
    console.log('★★★ cookie 有效！');
    // 保存
    fs.writeFileSync(path.join(__dirname, 'captures', 'cookie_ok.json'), JSON.stringify({
      nsd, cdLen: cd.length, cp3: r.cp3, cookie, name, oCookie: oCookie.split('=')[1], header,
      keys16: gv.keys[16].map(b => b.toString(16).padStart(2, '0')).join(' '),
      keys17: gv.keys[17].map(b => b.toString(16).padStart(2, '0')).join(' '),
    }, null, 2));
    console.log('已保存 captures/cookie_ok.json');
  } else {
    console.log('✗ cookie 无效。响应前 300:', replay.body.substring(0, 300));
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
