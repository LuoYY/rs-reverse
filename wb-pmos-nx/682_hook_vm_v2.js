/**
 * 682_hook_vm_v2.js
 * 宽松正则 hook 核心解释器（含 ._$kN），dump bytecode（basearr 子程序）
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
      // 宽松匹配：function NAME(...){...5000字符内 ._$kN
      const re = /function\s+([_$][\w$]*)\s*\(([^)]*)\)\{([^]{0,5000}?)([_$][\w$]*)=([^;]*?)\._\$kN/;
      const m2 = re.exec(s);
      if (m2) {
        const fnName = m2[1];
        // 找函数体 {（参数列表后第一个 {）
        const sigEnd = s.indexOf(')', m2.index + m2[0].indexOf('('));
        const bodyStart = s.indexOf('{', sigEnd);
        // 找 bytecode 变量名（m2[4] = 赋值目标，如 _$kH）
        const bcVar = m2[4];
        const bcSrc = m2[5];
        const inject = `window.__kLog.push((function(){try{var t=arguments[0];var b=t&&t._$kN?Array.from(t._$kN.slice(0,600)):null;return {fn:"${fnName}",bc:b,pos:arguments[1]};}catch(e){return {err:String(e.message).substring(0,40)}}})());`;
        if (bodyStart > 0) {
          s = s.substring(0, bodyStart + 1) + inject + s.substring(bodyStart + 1);
          console.log('[hook] 注入解释器:', fnName, 'bytecode var:', bcVar, 'src:', bcSrc);
        }
      } else {
        console.log('[hook] 未匹配核心解释器');
        // 打印候选（含 ._$kN 的函数签名）
        const candRe = /function\s+([_$][\w$]*)\s*\([^)]*\)/g;
        let cm, c = 0;
        while ((cm = candRe.exec(s)) !== null && c < 5) {
          const after = s.substring(cm.index, cm.index + 3000);
          if (after.includes('._$kN')) {
            console.log('  候选:', cm[0], '@', cm.index);
            c++;
          }
        }
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
  let saved = 0;
  for (const [i, k] of window.__kLog.entries()) {
    if (k.bc && Array.isArray(k.bc) && k.bc.length > 10) {
      console.log(`kLog[${i}] fn=${k.fn} bc_len=${k.bc.length} pos=${k.pos} 头=${k.bc.slice(0, 50).join(',')}`);
      if (saved < 5) {
        fs.writeFileSync('/tmp/nx_bytecode_' + i + '.json', JSON.stringify(k));
        saved++;
      }
    }
  }
  console.log('已保存 bytecode 数:', saved);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
