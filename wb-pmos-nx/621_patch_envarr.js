/**
 * 621_patch_envarr.js
 * 直接 patch 内层 VM 环境数组访问（_$iV[_$aI[N]] 等）为 __proxy 兜底
 * 强制推进内层 VM 到 basearr 生成
 * 基于 617 号的 dynCode + 迭代器
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
const PROXY = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
      let body = '';
      tlsSock.on('data', d => body += d);
      tlsSock.on('end', () => {
        const headEnd = body.indexOf('\r\n\r\n');
        resolve({ status: headEnd >= 0 ? parseInt((body.substring(0, headEnd).split(' ')[1] || '').trim()) : 'ERR', body: body.substring(headEnd + 4) });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'ERR', error: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战:', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const nsd = +m[1], cd = m[2];
  console.log('nsd=' + nsd);

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const env0 = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false });
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
      DataView.prototype.setFloat16 = function(byteOffset, value, littleEndian) { this.setUint16(byteOffset, 0, littleEndian); };
    }
    if (typeof window !== 'undefined') { window.DataView = DataView; }
    window.__proxy = function() { return new Proxy(function(){}, { get: function(t,p){ return window.__proxy(); }, set: function(t,p,v){ return true; }, apply: function(t,ta,a){ return window.__proxy(); } }); };
    __proxy = window.__proxy;
  `, env0.sandbox);
  try { vm.runInContext(outerJsCode, env0.sandbox, { timeout: 25000, filename: 'outer.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 5000));
  const dynCode = env0.getDynCode();
  if (!dynCode) { process.exit(1); }
  console.log('dynCode len:', dynCode.length);

  // 提取 $_ts
  let tsData = 'null';
  try {
    tsData = vm.runInContext('window.$_ts ? JSON.stringify(window.$_ts) : "null"', env0.sandbox);
    const td = JSON.parse(tsData);
    if (td.aebi && Array.isArray(td.aebi)) {
      for (let i = 0; i < td.aebi.length; i++) {
        if (td.aebi[i] === undefined || td.aebi[i] === null) td.aebi[i] = [];
        else if (!Array.isArray(td.aebi[i])) td.aebi[i] = [td.aebi[i]];
      }
    }
    tsData = JSON.stringify(td);
  } catch (e) {}

  // 迭代 patch
  const disabledOpcodes = new Set(['721', '154']);
  const safeCntRef = { sc: 0 };
  const envIds = new Set(['2331']);
  const patchedIdxs = new Set(); // 已兜底的 _$iV 访问位置

  for (let round = 1; round <= 12; round++) {
    console.log(`\n=== 第 ${round} 轮 ===`);
    const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false });
    const sandbox = env.sandbox;
    vm.runInContext(`
      if (typeof DataView !== 'undefined' && !DataView.prototype.getFloat16) {
        DataView.prototype.getFloat16 = function(byteOffset, littleEndian) { var u = this.getUint16(byteOffset, littleEndian); var sign=(u&0x8000)?-1:1; var exp=(u&0x7c00)>>10; var frac=u&0x03ff; if(exp===0)return sign*frac*Math.pow(2,-24); if(exp===0x1f)return frac?NaN:sign*Infinity; return sign*(1+frac/1024)*Math.pow(2,exp-15); };
        DataView.prototype.setFloat16 = function(byteOffset, value, littleEndian) { this.setUint16(byteOffset, 0, littleEndian); };
      }
      if (typeof window !== 'undefined') { window.DataView = DataView; }
      window.__proxy = function() { return new Proxy(function(){}, { get: function(t,p){ return window.__proxy(); }, set: function(t,p,v){ return true; }, apply: function(t,ta,a){ return window.__proxy(); } }); };
      __proxy = window.__proxy;
      window.__arrTrap = []; window.__props = []; window.__all = 0;
      window.__autofe = [];
      for (var __k of ['callPhantom','_phantom','__webdriver_evaluate','__lastWatirAlert','__lastWebdriverQuit','__webdriver_unwrap','__firefox__','__nightmare','_Selenium_IDE_Recorder','_selenium','calledSelenium','_WEBDRIVER_ELEM_CACHE','Chrome','__driver_evaluate','__webdriver_evaluate','__fxdriver_evaluate','__driver_unwrapped','__webdriver_unwrapped','__fxdriver_unwrapped','_wappalyzer','__nightmare','_phantom','callPhantom','safari']) { try { window[__k] = undefined; } catch(e) {} }
      if (window.Z8XHJJY === undefined) {
        window.Z8XHJJY = new Proxy(function(){}, { get: function(t,p){ return window.Z8XHJJY; }, set: function(t,p,v){ return true; }, apply: function(t,ta,a){ return window.Z8XHJJY; }, construct: function(t,a){ return window.Z8XHJJY; }, has: function(t,p){ return false; } });
      }
      Z8XHJJY = window.Z8XHJJY;
    `, sandbox);
    if (tsData && tsData !== 'null') {
      try { vm.runInContext('window.$_ts = ' + tsData + ';', sandbox); } catch (e) {}
    }

    let runCode = dynCode;
    // env safe patch（复用 617）——排除 =X[Y[N]] 和 !X[Y[N]]（由环境数组兜底处理）
    runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\]\[/g, (mm, x, y) => '=((' + x + '[' + y + '])||__proxy())[');
    runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)-1\](?![=(])/g, (mm, x, y) => '=((' + x + '[' + y + '-1])||__proxy())');
    runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[--([_$\w]+)\](?![=(])/g, (mm, x, y) => '=((' + x + '[--' + y + '])||__proxy())');
    runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([0-3])\](?![=(])/g, (mm, x, n) => '=(((' + x + ')&&(' + x + ')[' + n + '])||__proxy())');
    runCode = runCode.replace(/(function\s+([_$][\w$]*)\s*\(([_$][\w$]+),([_$][\w$]+),([_$][\w$]+),([_$][\w$]+)\)\{)([^]{0,250})/g, (mm, head, fn, p1, p2, p3, p4, body) => {
      if (!body.includes(p1 + '._') && !body.includes(p1 + '[')) return mm;
      return head + 'if(' + p4 + '===void 0||' + p4 + '===null){' + p4 + '=[__proxy(),__proxy(),__proxy(),__proxy()];}' + body;
    });
    // disabledOpcodes
    for (const op of disabledOpcodes) {
      const re = new RegExp('if\\(([_$\\w]+)===' + op + '\\)\\{[^{}]*\\}', 'g');
      runCode = runCode.replace(re, (mm, v) => 'if(' + v + '===' + op + '){}');
    }
    // envIds → true
    for (const id of envIds) {
      const re = new RegExp('([_$\\w]+)\\(' + id + '\\\\,', 'g');
      let out = '', last = 0, m;
      while ((m = re.exec(runCode)) !== null) {
        const openPos = runCode.indexOf('(', m.index + 1);
        let depth = 0, end = -1;
        for (let k = openPos; k < runCode.length; k++) {
          if (runCode[k] === '(') depth++;
          else if (runCode[k] === ')') { depth--; if (depth === 0) { end = k; break; } }
        }
        if (end < 0) break;
        out += runCode.slice(last, m.index) + 'true';
        last = end + 1;
        re.lastIndex = end + 1;
      }
      out += runCode.slice(last);
      runCode = out;
    }
    // ★ 关键：环境数组访问兜底（只替换读取位置，排除赋值左侧）
    // 模式1：X=Y[Z[N]]（Y 可能是 undefined，Z[N] 是属性名索引）
    let ivCount = 0;
    runCode = runCode.replace(/(?<![=!<>])=([_$][\w$]+)\[([_$][\w$]+)\[(\d+)\]\](?![=(])/g, (mm, obj, arr, num) => {
      ivCount++;
      return '=(((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']])||__proxy())';
    });
    // 模式2：!X[Y[N]]（取反读取）
    runCode = runCode.replace(/!([_$][\w$]+)\[([_$][\w$]+)\[(\d+)\]\]/g, (mm, obj, arr, num) => {
      ivCount++;
      return '!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']])';
    });
    // 模式3：调用参数/运算位置 X[Y[N]]（非赋值）
    runCode = runCode.replace(/([^=!<>])([_$][\w$]+)\[([_$][\w$]+)\[(\d+)\]\]/g, (mm, pre, obj, arr, num) => {
      ivCount++;
      return pre + '((' + obj + ')?' + obj + '[' + arr + '[' + num + ']]:__proxy())';
    });
    // while 计数
    runCode = runCode.replace(/while\(1\)\{/g, () => {
      return 'while(1){window.__all=(window.__all||0)+1;if(window.__all>15000000)throw new Error("ALL_LOOP");';
    });
    // 数组陷阱
    runCode = '(function(){var AP=Array.prototype;var op=AP.push;AP.push=function(){var r=op.apply(this,arguments);var l=this.length;if(l>=145&&l<=185){window.__arrTrap=(window.__arrTrap||[]);var arr=[];for(var i=0;i<this.length;i++)arr.push(typeof this[i]===\'number\'?this[i]:null);window.__arrTrap.push(arr);}return r;};})();' + runCode;
    fs.writeFileSync('/tmp/nx_iter3.js', runCode);
    console.log('环境数组兜底替换:', ivCount);

    const wrapped = '(function(){ try { ' + runCode + '; window.__dynOK = true; } catch(__e) { window.__err = { msg: String(__e.message), stack: String(__e.stack) }; throw __e; } })()';
    try {
      vm.runInContext(wrapped, sandbox, { timeout: 40000, filename: 'wrap.js' });
      console.log('★ 运行完成!');
      const trap = vm.runInContext('JSON.stringify(window.__arrTrap || [])', sandbox);
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
      fs.writeFileSync('/tmp/nx_jsdom_basearrs.json', JSON.stringify(arrs));
      process.exit(0);
    } catch (e) {
      console.log('运行失败:', e.message.substring(0, 80));
      try {
        const er = vm.runInContext('window.__err ? JSON.stringify(window.__err) : "no-err"', sandbox);
        if (er && er !== 'no-err') {
          const e2 = JSON.parse(er);
          const wm = (e2.stack || '').match(/wrap\.js:(\d+):(\d+)/);
          if (wm) {
            const line = +wm[1], col = +wm[2];
            const wrapLines = wrapped.split('\n');
            let absOff = 0;
            for (let i = 0; i < line - 1 && i < wrapLines.length; i++) absOff += wrapLines[i].length + 1;
            absOff += col - 1;
            const origOff = absOff - '(function(){ try { '.length;
            const ctx = runCode.substring(Math.max(0, origOff - 200), origOff + 100);
            console.log('报错位置 origOff=' + origOff);
            console.log('上下文:', ctx.substring(0, 250));
            // 尝试禁用 opcode
            const before = runCode.substring(Math.max(0, origOff - 400), origOff);
            const opMatches = [...before.matchAll(/===\s*(\d+)\)\{/g)];
            if (opMatches.length) {
              const lastOp = opMatches[opMatches.length - 1][1];
              if (!disabledOpcodes.has(lastOp)) { console.log('★ 禁用 opcode:', lastOp); disabledOpcodes.add(lastOp); }
            }
          }
        }
      } catch (e2) {}
    }
  }
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
