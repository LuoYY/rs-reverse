/**
 * 用 jsdom 完整浏览器环境跑外层 VM + 内层动态代码，生成真实 cookie。
 * jsdom 提供完整 window/document/location/navigator，让瑞数内层 VM 跑通。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_jsdom_full.js
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const https = require('https');
const { JSDOM } = require('jsdom');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(url, cookie) {
  return new Promise(r => {
    const headers = { 'User-Agent': UA };
    if (cookie) headers['Cookie'] = cookie;
    https.get(url, { rejectUnauthorized: false, headers }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', (e) => r({ status: 'ERR', body: '', headers: {}, error: e.message }));
  });
}

(async () => {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.error('no ts, status=' + ch.status); process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  console.log(`nsd=${ts.nsd} O=${oCookie ? oCookie.split('=')[0] : 'N/A'}`);

  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

  // jsdom 完整环境
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET,
    referrer: TARGET,
    contentType: 'text/html',
    userAgent: UA,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  // 注入 $_ts
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };
  // 捕获 cookie 写入
  const cookiesWritten = [];
  const origCookieDesc = Object.getOwnPropertyDescriptor(window.Document.prototype, 'cookie') || Object.getOwnPropertyDescriptor(window.HTMLDocument.prototype, 'cookie');
  let cookieJar = oCookie || '';
  Object.defineProperty(window.document, 'cookie', {
    get() { return cookieJar; },
    set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
    configurable: true,
  });

  console.log('\n[jsdom] 执行外层 VM + 内层动态代码...');
  try {
    window.eval(outerJsCode);
    // 等待内层 eval（瑞数可能 setTimeout）
    await new Promise(r => setTimeout(r, 3000));
  } catch (e) {
    console.log('  外层错误(可能可忽略):', e.message.substring(0, 80));
  }
  console.log(`  cookies 写入=${cookiesWritten.length} 条`);
  cookiesWritten.forEach((c, i) => console.log(`    [${i}] ${c.substring(0, 70)}`));
  console.log(`  document.cookie=${cookieJar.substring(0, 100)}`);

  const pCookieStr = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  if (pCookieStr) {
    console.log(`\n✓ jsdom 生成真实 P cookie`);
    const fullHeader = `${oCookie}; ${pCookieStr}`;
    const replay = await httpGet(TARGET, fullHeader);
    console.log(`重放: ${replay.status} ${replay.status === 200 ? '✓✓✓ 100% 有效!' : ''}`);
  } else {
    console.log('\n✗ jsdom 未生成 P cookie');
    // 打印 window 里瑞数相关全局，看内层是否执行
    console.log('  $_ts keys:', Object.keys(window.$_ts || {}));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
