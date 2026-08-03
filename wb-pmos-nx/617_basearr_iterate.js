/**
 * 617_basearr_iterate.js
 * 438 号完整迭代器 + 数组陷阱：
 * 逐步 patch dynCode → 运行 → 捕获 len 150-180 数组（basearr 明文）
 * 目标：逆向 nx basearr 扁平结构（jsdom 生成 vs 浏览器权威对比）
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

function applyPatches(code, envIds, safeCntRef, disabledOpcodes) {
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  if (re69.test(code)) code = code.replace(re69, '!$1?($2+=0):0;');
  let sc = 0;
  code = code.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) => {
    sc++;
    return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
  });
  let sc2 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\[(\d+)\]\](?![=(])/g, (mm, obj, arr, num) => {
    sc2++;
    return '=((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
  });
  let sc3 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\]\[/g, (mm, x, y) => { sc3++; return '=((' + x + '[' + y + '])||__proxy())['; });
  let sc4 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)-1\](?![=(])/g, (mm, x, y) => { sc4++; return '=((' + x + '[' + y + '-1])||__proxy())'; });
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[--([_$\w]+)\](?![=(])/g, (mm, x, y) => { sc4++; return '=((' + x + '[--' + y + '])||__proxy())'; });
  let sc5 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([0-3])\](?![=(])/g, (mm, x, n) => { sc5++; return '=(((' + x + ')&&(' + x + ')[' + n + '])||__proxy())'; });
  let sc6 = 0;
  code = code.replace(/(function\s+([_$][\w$]*)\s*\(([_$][\w$]+),([_$][\w$]+),([_$][\w$]+),([_$][\w$]+)\)\{)([^]{0,250})/g, (mm, head, fn, p1, p2, p3, p4, body) => {
    if (!body.includes(p1 + '._') && !body.includes(p1 + '[')) return mm;
    sc6++;
    return head + 'if(' + p4 + '===void 0||' + p4 + '===null){' + p4 + '=[__proxy(),__proxy(),__proxy(),__proxy()];}' + body;
  });
  safeCntRef.sc = sc + '/' + sc2 + '/' + sc3 + '/' + sc4 + '/' + sc5 + '/' + sc6;
  let dc = 0;
  for (const op of disabledOpcodes) {
    const re = new RegExp('if\\(([_$\\w]+)===' + op + '\\)\\{[^{}]*\\}', 'g');
    code = code.replace(re, (mm, v) => { dc++; return 'if(' + v + '===' + op + '){}'; });
  }
  safeCntRef.dc = dc;
  let tc = 0;
  for (const id of envIds) {
    const re = new RegExp('([_$\\w]+)\\(' + id + '\\\\,', 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(code)) !== null) {
      const openPos = code.indexOf('(', m.index + 1);
      let depth = 0, end = -1;
      for (let k = openPos; k < code.length; k++) {
        if (code[k] === '(') depth++;
        else if (code[k] === ')') { depth--; if (depth === 0) { end = k; break; } }
      }
      if (end < 0) break;
      out += code.slice(last, m.index) + 'true';
      last = end + 1;
      re.lastIndex = end + 1;
      tc++;
    }
    out += code.slice(last);
    code = out;
  }
  let gi = 0;
  code = code.replace(/while\(1\)\{/g, () => {
    gi++;
    return 'while(1){window.__w' + gi + '=(window.__w' + gi + '||0)+1;window.__lastW=' + gi + ';if(window.__all>15000000)throw new Error("ALL_LOOP_w' + gi + '");window.__all=(window.__all||0)+1;';
  });
  // ★ 数组陷阱：push 到 150-180 长度数组
  code = '(function(){var AP=Array.prototype;var op=AP.push;AP.push=function(){var r=op.apply(this,arguments);var l=this.length;if(l>=145&&l<=185){window.__arrTrap=(window.__arrTrap||[]);var arr=[];for(var i=0;i<this.length;i++)arr.push(typeof this[i]===\'number\'?this[i]:null);window.__arrTrap.push(arr);}return r;};})();' + code;
  return { code, envTrue: tc };
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
  console.log('dynCode len:', dynCode.length);
  if (!dynCode) { process.exit(1); }

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
    console.log('$_ts keys:', Object.keys(td).join(','));
  } catch (e) { console.log('提取 $_ts 失败:', e.message.substring(0, 60)); }

  const envIds = new Set(['2331']);
  const disabledOpcodes = new Set();
  const safeCntRef = { sc: 0 };

  for (let round = 1; round <= 15; round++) {
    console.log(`\n=== 第 ${round} 轮 ===`);
    const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false });
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
        DataView.prototype.setFloat16 = function(byteOffset, value, littleEndian) { this.setUint16(byteOffset, 0, littleEndian); };
      }
      if (typeof window !== 'undefined') { window.DataView = DataView; }
      window.__proxy = function() { return new Proxy(function(){}, { get: function(t,p){ return window.__proxy(); }, set: function(t,p,v){ return true; }, apply: function(t,ta,a){ return window.__proxy(); } }); };
      __proxy = window.__proxy;
      window.__arrTrap = [];
      window.__props = [];
      window.__all = 0;
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
    const { code: runCode, envTrue } = applyPatches(dynCode, envIds, safeCntRef, disabledOpcodes);
    fs.writeFileSync('/tmp/nx_iter2.js', runCode);
    console.log('safe:', safeCntRef.sc, 'dc:', safeCntRef.dc, 'disOps:', [...disabledOpcodes].join(','));

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
            const ctx = runCode.substring(Math.max(0, origOff - 150), origOff + 80);
            console.log('报错位置 origOff=' + origOff);
            console.log('上下文:', ctx.substring(0, 200));
            const before = runCode.substring(Math.max(0, origOff - 400), origOff);
            const opMatches = [...before.matchAll(/===\s*(\d+)\)\{/g)];
            if (opMatches.length) {
              const lastOp = opMatches[opMatches.length - 1][1];
              if (!disabledOpcodes.has(lastOp)) { console.log('★ 禁用 opcode:', lastOp); disabledOpcodes.add(lastOp); }
            }
          }
        }
      } catch (e2) { console.log('读 stack 失败'); }
    }
  }
  console.log('达到最大轮数');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
