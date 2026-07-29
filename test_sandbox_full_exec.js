/**
 * 终极突破：沙箱【真正执行】内层动态代码，让它生成真实 cookie（含真实 keys16/17）。
 *
 * 与 extract_dyncode_20080 的区别：realEval 不再只捕获不执行，
 * 而是真正 vm.runInContext 执行内层动态代码，并 hook document.cookie 写入，
 * 捕获瑞数生成的真实 O/P cookie（100% 有效，因为它就是真实算法）。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_sandbox_full_exec.js [ts.json]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const https = require('https');

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

function checksum(code) { let s = 0; for (let i = 0; i < code.length; i += 100) s += code.charCodeAt(i); return s; }

/** 沙箱真正执行外层 VM + 内层动态代码，捕获真实 cookie */
function runFullVM(ts, outerJsCode) {
  const captured = { cookies: [], dynCodes: [], execResults: [] };
  const document = {
    _cookie: '',
    get cookie() { return this._cookie; },
    set cookie(v) { captured.cookies.push(v); this._cookie = this._cookie ? this._cookie + '; ' + v : v; },
    createElement: () => ({ style: {}, setAttribute: () => {}, getElementsByTagName: () => [], getContext: () => null }),
    getElementsByTagName: () => [],
    documentElement: { style: {} },
    body: { appendChild: () => {} },
    hidden: false,
    readyState: 'complete',
  };
  const navigator = {
    userAgent: UA, platform: 'MacIntel', maxTouchPoints: 0, appName: 'Netscape', appVersion: '5.0',
    language: 'zh-CN', languages: ['zh-CN'], cookieEnabled: true,
  };
  const screen = { width: 1680, height: 1050, availWidth: 1680, availHeight: 1025, colorDepth: 24 };
  const location = { href: TARGET, pathname: '/', hostname: 'pmos.xj.sgcc.com.cn', protocol: 'https:', host: 'pmos.xj.sgcc.com.cn:20080', origin: 'https://pmos.xj.sgcc.com.cn:20080', reload: () => {}, replace: () => {}, assign: () => {} };
  document.location = location;

  const sandbox = {
    console, document, navigator, screen, location,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, Symbol, Map, Set, WeakMap, Promise, Uint8Array, ArrayBuffer, DataView, Intl,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, escape, unescape, btoa, atob,
    setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },
    setInterval: () => 0, clearInterval: () => {}, clearTimeout: () => {},
    requestAnimationFrame: (fn) => 0,
    // 内层动态代码可能直接访问这些全局名
    innerWidth: 1680, innerHeight: 938, outerWidth: 1680, outerHeight: 1025,
    devicePixelRatio: 2,
    history: { pushState: () => {}, replaceState: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    XMLHttpRequest: function () { return { open: () => {}, send: () => {}, setRequestHeader: () => {}, addEventListener: () => {} }; },
    fetch: () => Promise.resolve({ text: () => Promise.resolve(''), json: () => Promise.resolve({}) }),
    Image: function () { return {}; },
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    getComputedStyle: () => ({}),
    $_ts: { nsd: ts.nsd, cd: ts.cd },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  // 捕获缺失的全局属性（定位内层需要的环境）
  const missing = [];
  const handler = {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'string' && !prop.startsWith('_') && prop !== 'then') {
        missing.push(prop);
        // 返回一个带常见属性的容错对象，避免崩溃
        return new Proxy({ location, navigator, document, style: {} }, {
          get(tt, pp) { if (pp in tt) return tt[pp]; return undefined; }
        });
      }
      return undefined;
    },
    has() { return true; } // 让 with/全局检查通过
  };
  const proxied = new Proxy(sandbox, handler);

  // 关键：真正执行内层动态代码（递归 eval），用 proxied 捕获缺失环境
  const realEval = (code) => {
    if (typeof code === 'string') {
      if (code.length > 50000) captured.dynCodes.push(code);
      try {
        return vm.runInContext(code, proxied, { timeout: 30000 });
      } catch (e) {
        captured.execResults.push('ERR:' + e.message.substring(0, 60));
        captured.execStacks = captured.execStacks || [];
        captured.execStacks.push(e.stack);
        return undefined;
      }
    }
    return undefined;
  };
  sandbox.eval = realEval;
  sandbox.window.eval = realEval;

  vm.createContext(proxied);
  try {
    vm.runInContext(outerJsCode, proxied, { timeout: 30000 });
  } catch (e) {
    captured.error = e.message;
    captured.errorStack = e.stack;
  }
  // setTimeout 已同步执行，cookie 应已写入
  return {
    cookies: captured.cookies,
    dynCodes: captured.dynCodes,
    execResults: captured.execResults,
    execStacks: captured.execStacks,
    error: captured.error,
    errorStack: captured.errorStack,
    documentCookie: document._cookie,
    missing,
  };
}

(async () => {
  // 拉挑战页
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.error('no ts, status=' + ch.status); process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  console.log(`nsd=${ts.nsd} O=${oCookie ? oCookie.split('=')[0] : 'N/A'}`);

  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  console.log('\n[沙箱] 真正执行外层 VM + 内层动态代码...');
  const result = runFullVM(ts, outerJsCode);
  console.log(`  dynCodes=${result.dynCodes.length} execResults=${JSON.stringify(result.execResults.slice(0, 5))}`);
  console.log(`  missing 全局属性: ${JSON.stringify([...new Set(result.missing || [])].slice(0, 20))}`);
  if (result.execStacks && result.execStacks[0]) console.log('  堆栈:\n' + result.execStacks[0].split('\n').slice(0, 6).join('\n'));
  console.log(`  cookies 写入=${result.cookies.length} 条`);
  result.cookies.forEach((c, i) => console.log(`    [${i}] ${c.substring(0, 60)}${c.length > 60 ? '...' : ''}`));
  if (result.error) console.log(`  沙箱错误: ${result.error}\n  堆栈: ${(result.errorStack || '').split('\n').slice(1, 5).join(' | ')}`);

  // 提取 P cookie
  const pCookieStr = result.cookies.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  if (pCookieStr) {
    console.log(`\n✓ 沙箱生成真实 P cookie: ${pCookieStr.substring(0, 40)}...`);
    // 重放验证
    const fullHeader = `${oCookie}; ${pCookieStr}`;
    const replay = await httpGet(TARGET, fullHeader);
    console.log(`重放: ${replay.status} ${replay.status === 200 ? '✓✓✓ 沙箱 cookie 100% 有效!' : ''}`);
  } else {
    console.log('\n✗ 沙箱未生成 P cookie（内层动态代码未完整执行/cookie 未写入）');
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
