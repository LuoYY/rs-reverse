/**
 * 46_test_pipeline_cookie.js
 *
 * 用 len243-nx（getKey=0x68 + basearr303 硬编码）生成 cookie 立即重放
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function httpGet(url, cookieH) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'GET', rejectUnauthorized: false,
      headers: { 'User-Agent': UA, 'Accept': '*/*', ...(cookieH ? { Cookie: cookieH } : {}) },
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
    req.end();
  });
}

async function main() {
  // 读取 basearr303
  const dec = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_decoded.json')));
  const basearr303 = dec.basearr;
  console.log('basearr303 len:', basearr303.length);

  // 重试循环：拉挑战 → 管线 → 成功为止（管线对 nx cd 有概率性失败）
  for (let attempt = 1; attempt <= 6; attempt++) {
    console.log(`\n===== 尝试 ${attempt} =====`);
    try {
      // 1. 拉挑战
      const ch = await httpGet(TARGET);
      const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
      if (!m) { console.log('无挑战页:', ch.status); continue; }
      const nsd = +m[1], cd = m[2];
      const setCookies = [].concat(ch.headers['set-cookie'] || []);
      const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
      const oName = oCookie.split('=')[0], oVal = oCookie.split('=')[1];
      console.log('nsd=' + nsd + ' O=' + oName + ' len=' + (oVal || '').length);

      // 2. 管线
      for (const k of Object.keys(require.cache)) delete require.cache[k];
      require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
      const gv = require('@src/handler/globalVarible');
      const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
      const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
      const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
      const { getCode } = require('@utils/');
      const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
      fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
      const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
      const codeRet = await getCode(argv.jsurls);
      argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
      gv._setAttr('argv', argv);
      require('@src/config/')(gv);
      gv._setAttr('_ts', ts);
      gv.makecookieRuntimeConfig = { ...(gv.makecookieRuntimeConfig || {}), seg0Override: basearr303 };
      gv.config.adapt = { ...gv.config.adapt, getKey: 0x68 };

      const Coder = require('@src/handler/Coder');
      const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
      const { $_ts: fullTs, codemap } = coder.run();
      fullTs.cp[3] = r.cp3;
      gv.config.codemap = codemap;
      const Cookie = require('@src/handler/Cookie');
      const cookie = new Cookie(coder).run();
      const pName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + 'P';
      console.log('管线 cookie:', pName, 'len=' + cookie.length);

      // 3. 立即重放
      const resp = await httpGet(TARGET, `${oName}=${oVal}; ${pName}=${cookie}`);
      console.log('立即重放 →', resp.status);
      if (resp.status === 200) {
        console.log('★★★ 管线 cookie 有效！');
        return;
      }
      console.log('响应前 100:', resp.body.substring(0, 100));
    } catch (e) {
      console.log('管线失败:', e.message.substring(0, 80));
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('\n全部尝试失败');
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
