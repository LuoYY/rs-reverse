/**
 * 616_jsdom_basearr_gen.js
 * jsdom/sandbox 完整环境跑 nx 外层 VM + 内层动态代码 → 生成 basearr
 * 逆向 nx 扁平 basearr 结构（对照浏览器 535 数据集）
 * 用 sandbox_keygen 框架（438 号已验证能跑内层 VM）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const tls = require('tls');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
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
  if (ch.status !== 412) { console.log('挑战失败', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false });
  const sandbox = env.sandbox;
  vm.runInContext(`
    if (typeof DataView !== 'undefined' && !DataView.prototype.getFloat16) {
      DataView.prototype.getFloat16 = function(byteOffset, littleEndian) {
        var u = this.getUint16(byteOffset, littleEndian);
        var sign = (u & 0x8000) ? -1 : 1;
        var exp = (u & 0x7c00) >> 10;
        var frac = u & 0x03ff;
        if (exp === 0) return sign * frac * Math.pow(2, -24);
        if (exp === 0x1f) return frac ? NaN : sign * Infinity;
        return sign * (1 + frac / 1024) * Math.pow(2, exp - 15);
      };
    }
    if (typeof window !== 'undefined') { window.DataView = DataView; }
    window.__proxy = function() { return new Proxy(function(){}, { get: function(t,p){ return window.__proxy(); }, set: function(t,p,v){ return true; } }); };
    __proxy = window.__proxy;
  `, sandbox);
  try { vm.runInContext(outerJsCode, sandbox, { timeout: 25000, filename: 'outer.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 5000));
  const dynCode = env.getDynCode();
  console.log('dynCode len:', dynCode.length);
  if (!dynCode) { process.exit(1); }

  // 反检测全局显式 undefined（438 号关键补丁）
  vm.runInContext(`
    window.__autofe = [];
    for (var __k of ['callPhantom','_phantom','__webdriver_evaluate','__lastWatirAlert','__lastWebdriverQuit','__webdriver_unwrap','__firefox__','__nightmare','_Selenium_IDE_Recorder','_selenium','calledSelenium','_WEBDRIVER_ELEM_CACHE','Chrome','__driver_evaluate','__webdriver_evaluate','__fxdriver_evaluate','__driver_unwrapped','__webdriver_unwrapped','__fxdriver_unwrapped','_wappalyzer','__nightmare','_phantom','callPhantom','safari','document.__selenium_unwrapped','document.__webdriver_evaluate','document.__webdriver_unwrapped','document.__fxdriver_evaluate','document.__fxdriver_unwrapped','domAutomation','domAutomationController','window.chrome','window.__webdriver_script_fn']) {
      try { window[__k] = undefined; } catch(e) {}
    }
    if (window.Z8XHJJY === undefined) {
      window.Z8XHJJY = new Proxy(function(){}, {
        get: function(t, p) { return window.Z8XHJJY; },
        set: function(t, p, v) { return true; },
        apply: function(t, thisArg, args) { return window.Z8XHJJY; },
        construct: function(t, args) { return window.Z8XHJJY; },
        has: function(t, p) { return false; },
      });
    }
    Z8XHJJY = window.Z8XHJJY;
  `, sandbox);

  // 运行 dynCode（patch 后），捕获 basearr
  let runCode = dynCode;
  // env safe patch
  runCode = runCode.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) =>
    '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
  runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\[(\d+)\]\](?![=(])/g, (mm, obj, arr, num) =>
    '=((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
  // 数组陷阱：捕获 len 155-180 的数组 push（basearr 候选）
  runCode = 'var __origPush=' + JSON.stringify('') + ';' + `(function(){var AP=Array.prototype;var op=AP.push;AP.push=function(){var r=op.apply(this,arguments);var l=this.length;if(l>=150&&l<=180){window.__arrTrap=(window.__arrTrap||[]);var arr=[];for(var i=0;i<this.length;i++)arr.push(typeof this[i]==='number'?this[i]:null);window.__arrTrap.push(arr);}return r;};})();` + runCode;

  try {
    vm.runInContext(runCode, sandbox, { timeout: 40000, filename: 'dyn.js' });
    console.log('运行完成');
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 100));
  }
  // 提取捕获数组
  const trap = vm.runInContext('window.__arrTrap ? JSON.stringify(window.__arrTrap) : "null"', sandbox);
  if (trap && trap !== 'null') {
    const arrs = JSON.parse(trap);
    console.log('捕获数组数:', arrs.length);
    const seen = new Set();
    for (const a of arrs) {
      const head = (a || []).slice(0, 30).map(x => x === null ? '??' : x.toString(16).padStart(2, '0')).join(' ');
      if (!seen.has(head)) {
        seen.add(head);
        console.log(`[len=${a.length}] ${head}`);
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
