/**
 * 70_jsdom_nx.js
 *
 * 应用 xj 文档转机4（K2）方法：jsdom 当密钥计算器
 * 用 jsdom 完整浏览器环境跑 nx 外层 VM + 内层动态代码，让瑞数自己生成 cookie
 * → 若生成 P cookie，说明内层动态代码在 jsdom 环境能跑通（绕开 Node vm 沙箱死循环）
 * → 反解密钥验证 keys 纯计算 f(nsd,cd)
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node wb-pmos-nx/70_jsdom_nx.js
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const http = require('http');
const tls = require('tls');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');

function httpGet(url, cookie, timeout = 60000) {
  return new Promise(r => {
    const u = new URL(url);
    const headers = { 'User-Agent': UA, 'Accept': '*/*' };
    if (cookie) headers['Cookie'] = cookie;
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); r({ status: 'ERR', body: '', headers: {} }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        const pathStr = u.pathname + u.search;
        const head = `GET ${pathStr} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\n`;
        const hdrs = Object.entries(headers).filter(([k]) => k !== 'User-Agent' && k !== 'Accept').map(([k, v]) => `${k}: ${v}`).join('\r\n');
        tlsSock.write(head + (hdrs ? hdrs + '\r\n' : '') + 'Connection: close\r\n\r\n');
      });
      let body = '';
      let raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const resHead = raw.substring(0, headEnd);
          body = raw.substring(headEnd + 4);
          const status = parseInt((resHead.split(' ')[1] || '').trim());
          const setCookies = [];
          resHead.split('\r\n').forEach(l => { if (/^set-cookie:/i.test(l)) setCookies.push(l.substring(11)); });
          r({ status, body, headers: { 'set-cookie': setCookies } });
        } else r({ status: 'ERR', body: '', headers: {} });
      });
      tlsSock.on('error', e => r({ status: 'ERR', body: '', headers: {}, error: e.message }));
    });
    connectReq.on('error', e => r({ status: 'ERR', body: '', headers: {}, error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); r({ status: 'TIMEOUT', body: '', headers: {} }); });
    connectReq.end();
  });
}

(async () => {
  // 1. 拉挑战页
  console.log('[1] 拉挑战页...');
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.error('无 $_ts, status=' + ch.status); process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  console.log(`nsd=${ts.nsd} cdLen=${ts.cd.length} O=${oCookie.split('=')[0] || 'N/A'}`);

  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  console.log('外层 JS:', OUTER_JS, outerJsCode.length, 'chars');

  // 2. jsdom 完整环境（nx 参数化）
  console.log('\n[2] jsdom 执行外层 VM + 内层动态代码...');
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET,
    referrer: TARGET,
    contentType: 'text/html',
    userAgent: UA,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };
  const cookiesWritten = [];
  let cookieJar = oCookie || '';
  Object.defineProperty(window.document, 'cookie', {
    get() { return cookieJar; },
    set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
    configurable: true,
  });

  // 监控 eval 动态代码（对比沙箱死循环）
  const origEval = window.eval;
  let dynSeen = false;
  window.eval = function (code) {
    if (typeof code === 'string' && code.length > 50000 && !dynSeen) {
      dynSeen = true;
      console.log(`  捕获动态代码 ${code.length} chars`);
      fs.writeFileSync(path.join(OUT, 'jsdom_dyn_' + Date.now() + '.js'), code);
    }
    return origEval.call(this, code);
  };

  // 捕获 jsdom 内层 VM 的异步错误
  window.addEventListener('error', (e) => {
    console.log('  [window.onerror]', String(e.error || e.message).substring(0, 120));
  });
  window.onunhandledrejection = (e) => console.log('  [unhandled]', String(e.reason || '').substring(0, 120));
  const errs = [];
  const origSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = function (fn, ms) {
    return origSetTimeout(function () {
      try { return fn(); } catch (e) { errs.push(String(e.message || e).substring(0, 120)); console.log('  [timer err]', errs[errs.length - 1]); }
    }, ms);
  };
  try {
    window.eval(outerJsCode);
    await new Promise(r => setTimeout(r, 15000));
  } catch (e) {
    console.log('  外层错误(可忽略):', e.message.substring(0, 80));
  }
  console.log(`  cookies 写入=${cookiesWritten.length} 条`);
  cookiesWritten.forEach((c, i) => console.log(`    [${i}] ${c.substring(0, 60)}`));

  const pCookieStr = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  if (pCookieStr) {
    console.log(`\n★ jsdom 生成 nx P cookie len=${pCookieStr.split('=')[1].length}`);
    const fullHeader = `${oCookie}; ${pCookieStr}`;
    const replay = await httpGet(TARGET, fullHeader);
    console.log(`重放: ${replay.status} ${replay.status === 200 ? '✓✓✓ 有效!' : ''}`);
    // 保存供反解
    fs.writeFileSync(path.join(OUT, 'jsdom_cookie_' + Date.now() + '.json'), JSON.stringify({ ts, oCookie, pCookie: pCookieStr, status: replay.status }));
  } else {
    console.log('\n✗ jsdom 未生成 P cookie');
    console.log('  $_ts keys:', Object.keys(window.$_ts || {}));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
