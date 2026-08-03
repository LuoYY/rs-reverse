/**
 * 681_hook_vm_core.js
 * jsdom hook eval 拦截 dynCode，替换内层 VM 核心解释器（_$_K）定义
 * dump bytecode（_$$a._$kN）+ 参数，反编译 basearr 生成
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { JSDOM } = require('jsdom');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');

function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let body = '', raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const resHead = raw.substring(0, headEnd);
          const setCookies = [];
          resHead.split('\r\n').forEach(l => { if (/^set-cookie:/i.test(l)) setCookies.push(l.substring(11).split(';')[0]); });
          resolve({ status: parseInt((resHead.split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4), setCookies });
        } else resolve({ status: 'ERR' });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR' }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR' }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);

  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };
  window.__kLog = [];

  const origEval = window.eval.bind(window);
  window.eval = function (s) {
    if (typeof s === 'string' && s.length > 100000) {
      // 替换内层 VM 核心解释器定义（含 _$kH=_?._$kN 特征）
      // 通用：找 function XXX(...){ var ...; _$kH=..._$kN...
      const re = /(function\s+([_$][\w$]*)\s*\(([^)]*)\)\{[^}]{0,300}?_?\._\$kN)/;
      const m2 = re.exec(s);
      if (m2) {
        const fnName = m2[2];
        // 在函数体开头注入 dump
        const head = m2[0];
        const inject = `window.__kLog.push((function(){try{var a=arguments[0];return {fn:"${fnName}",kn:a&&a._$kN?Array.from(a._$kN.slice(0,500)):null,args:[typeof arguments[0],typeof arguments[1],typeof arguments[2]]};}catch(e){return {err:String(e.message).substring(0,50)}}})());`;
        // 在 { 后注入（第一个 { 是参数列表后？不，函数体）
        const fnStart = m2.index;
        const openBrace = s.indexOf('{', fnStart + m2[0].indexOf('{'));
        // 简化：在函数签名 { 后注入
        const sigEnd = s.indexOf(')', fnStart + m2[0].indexOf('('));
        const bodyStart = s.indexOf('{', sigEnd);
        if (bodyStart > 0) {
          s = s.substring(0, bodyStart + 1) + inject + s.substring(bodyStart + 1);
          console.log('[hook] 注入核心解释器:', fnName);
        }
      } else {
        console.log('[hook] 未找到核心解释器模式');
      }
    }
    return origEval(s);
  };

  const cookiesWritten = [];
  let cookieJar = '';
  Object.defineProperty(window.document, 'cookie', {
    get() { return cookieJar; },
    set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
    configurable: true,
  });
  window.addEventListener('error', () => {});
  try { window.eval(outerJsCode); } catch (e) { console.log('外层 eval err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 15000));
  const pJ = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('jsdom P cookie:', pJ ? 'YES' : '无');

  console.log('__kLog 条数:', window.__kLog.length);
  for (const [i, k] of window.__kLog.entries()) {
    if (k.kn) {
      console.log(`\nkLog[${i}] fn=${k.fn} kn_len=${k.kn.length}`);
      console.log('bytecode 头 100:', k.kn.slice(0, 100).join(','));
      fs.writeFileSync('/tmp/nx_bytecode_' + i + '.json', JSON.stringify(k.kn));
    } else {
      console.log(`kLog[${i}]:`, JSON.stringify(k).substring(0, 120));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
