/**
 * 52_makecookie_flow.js
 *
 * 用 makeCookie 完整流程生成 nx cookie（含 cp3Override 覆盖）
 * 多次重试直到成功
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function httpGet(url, cookieH) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', rejectUnauthorized: false,
      headers: { 'User-Agent': UA, 'Accept': '*/*', ...(cookieH ? { Cookie: cookieH } : {}) },
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
    req.end();
  });
}

async function main() {
  for (let attempt = 1; attempt <= 8; attempt++) {
    console.log(`\n===== 尝试 ${attempt} =====`);
    try {
      const ch = await httpGet(TARGET);
      const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
      if (!m) { console.log('无挑战页'); continue; }
      const nsd = +m[1], cd = m[2];
      const setCookies = [].concat(ch.headers['set-cookie'] || []);
      const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
      const [oName, oVal] = oCookie.split('=');
      console.log('nsd=' + nsd + ' O len=' + (oVal || '').length);

      for (const k of Object.keys(require.cache)) delete require.cache[k];
      require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
      const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
      const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
      const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
      if (!r.cp3) { console.log('cp3 提取失败'); continue; }

      const gv = require('@src/handler/globalVarible');
      const { getCode } = require('@utils/');
      const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
      fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
      const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
      const codeRet = await getCode(argv.jsurls);
      argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
      gv._setAttr('argv', argv);
      require('@src/config/')(gv);
      gv._setAttr('_ts', ts);

      // makeCookie 完整流程
      const makeCookie = require('@src/makeCookie');
      const cookie = makeCookie(ts, () => path.join(ROOT, 'output'));
      const pName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + 'P';
      console.log('cookie:', pName, 'len=' + cookie.length);

      const resp = await httpGet(TARGET, `${oName}=${oVal}; ${pName}=${cookie}`);
      console.log('立即重放 →', resp.status);
      if (resp.status === 200) {
        console.log('★★★ 成功！');
        return;
      }
    } catch (e) {
      console.log('失败:', e.message.substring(0, 100));
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('\n全部失败');
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
