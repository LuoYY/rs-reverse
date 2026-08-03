/**
 * 438_auto_iterate.js
 * 自动迭代器：一次捕获动态代码 → 循环运行/报错/patch 环境 ID 调用 → 直到生成 cookie
 * 每轮：新 sandbox + 应用已积累的 patch → 运行 → 报错 col 反推 → 提取环境 ID → 加 patch
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

// patch 应用函数：返回新 runCode
function applyPatches(runCode, envIds, safeCntRef, disabledOpcodes) {
  let code = runCode;
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  if (re69.test(code)) code = code.replace(re69, '!$1?($2+=0):0;');
  // env safe（!X[Y[N]] 取反读取）
  let sc = 0;
  code = code.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) => {
    sc++;
    return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
  });
  // =X[Y[N]] 赋值右侧读取（排除 ==/!=/<=/>= 后顾 + 排除赋值左侧/函数调用 前瞻）
  let sc2 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\[(\d+)\]\](?![=(])/g, (mm, obj, arr, num) => {
    sc2++;
    return '=((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
  });
  // =X[Y][ 赋值右侧双层索引开头 safe（兜底环境对象池缺失，__proxy 万能容错）
  let sc3 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\]\[/g, (mm, x, y) => {
    sc3++;
    return '=((' + x + '[' + y + '])||__proxy())[';
  });
  safeCntRef.sc = sc + '/' + sc2 + '/' + sc3;
  // ★ 栈取元素兜底：=X[Y-1] / =X[--Y] / =X[Y+1] → 兜底 __proxy()
  let sc4 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)-1\](?![=(])/g, (mm, x, y) => { sc4++; return '=((' + x + '[' + y + '-1])||__proxy())'; });
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[--([_$\w]+)\](?![=(])/g, (mm, x, y) => { sc4++; return '=((' + x + '[--' + y + '])||__proxy())'; });
  // ★ 环境数组元素赋值兜底：=X[0-3] → 兜底 __proxy()（_$f6=_$bl[0] 等）
  let sc5 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([0-3])\](?![=(])/g, (mm, x, n) => { sc5++; return '=(((' + x + ')&&(' + x + ')[' + n + '])||__proxy())'; });
  // ★ 4 参数内层 VM 函数入口兜底第 4 参数（_$pS 环境数组 → __proxy 数组）
  let sc6 = 0;
  code = code.replace(/(function\s+([_$][\w$]*)\s*\(([_$][\w$]+),([_$][\w$]+),([_$][\w$]+),([_$][\w$]+)\)\{)([^]{0,250})/g, (mm, head, fn, p1, p2, p3, p4, body) => {
    if (!body.includes(p1 + '._') && !body.includes(p1 + '[')) return mm;
    sc6++;
    return head + 'if(' + p4 + '===void 0||' + p4 + '===null){' + p4 + '=[__proxy(),__proxy(),__proxy(),__proxy()];}' + body;
  });
  safeCntRef.sc = sc + '/' + sc2 + '/' + sc3 + '/' + sc4 + '/' + sc5 + '/' + sc6;
  // ★ 清空 disabledOpcodes 的分支：if(X===N){...} → if(X===N){}
  let dc = 0;
  for (const op of disabledOpcodes) {
    const re = new RegExp('if\\(([_$\\w]+)===' + op + '\\)\\{[^{}]*\\}', 'g');
    code = code.replace(re, (mm, v) => { dc++; return 'if(' + v + '===' + op + '){}'; });
  }
  safeCntRef.dc = dc;
  // 环境 ID 调用 → true（括号匹配替换整个调用）
  let tc = 0;
  for (const id of envIds) {
    const re = new RegExp('([_$\\w]+)\\(' + id + '\\\\,', 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(code)) !== null) {
      const openPos = code.indexOf('(', m.index + 1); // '(' 位置（函数名后）
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
  // while 计数
  let gi = 0;
  code = code.replace(/while\(1\)\{/g, () => {
    gi++;
    return 'while(1){window.__w' + gi + '=(window.__w' + gi + '||0)+1;window.__lastW=' + gi + ';if(window.__all>15000000)throw new Error("ALL_LOOP_w' + gi + '");window.__all=(window.__all||0)+1;';
  });
  return { code, envTrue: tc };
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战:', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const nsd = +m[1], cd = m[2];
  console.log('nsd=' + nsd);
  fs.writeFileSync('/tmp/nx_nsd_cd.json', JSON.stringify({ nsd, cd }));

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const env0 = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false });
  // ★ polyfill DataView.prototype.getFloat16/setFloat16（Node 22 缺 ES2025 API，瑞数环境检测用）
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
      DataView.prototype.setFloat16 = function(byteOffset, value, littleEndian) {
        this.setUint16(byteOffset, 0, littleEndian);
      };
    }
    if (typeof window !== 'undefined') { window.DataView = DataView; }
  `, env0.sandbox);
  try { vm.runInContext(outerJsCode, env0.sandbox, { timeout: 25000, filename: 'outer.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 5000));
  const dynCode = env0.getDynCode();
  if (!dynCode) { console.log('无动态代码'); process.exit(1); }
  console.log('dynCode len:', dynCode.length);
  fs.writeFileSync('/tmp/nx_dyncode_raw.js', dynCode);

  const envIds = new Set(['2331']); // 已知环境 ID
  const disabledOpcodes = new Set(); // 报错 opcode（清空分支）
  const safeCntRef = { sc: 0 };
  const PREFIX = '(function(){ try { ';

  // ★ 提取 $_ts（外层 VM 生成的环境数据：aebi/scj/cp 等）
  let tsData = 'null';
  try {
    tsData = vm.runInContext('window.$_ts ? JSON.stringify(window.$_ts) : "null"', env0.sandbox);
    const td = JSON.parse(tsData);
    // 兜底：aebi undefined 组 → []（避免内层 VM 访问 undefined 报错）
    if (td.aebi && Array.isArray(td.aebi)) {
      for (let i = 0; i < td.aebi.length; i++) {
        if (td.aebi[i] === undefined || td.aebi[i] === null) { td.aebi[i] = []; }
        else if (!Array.isArray(td.aebi[i])) { td.aebi[i] = [td.aebi[i]]; }
      }
    }
    console.log('$_ts keys:', Object.keys(td).join(','), 'aebi groups:', (td.aebi || []).map(g => (g || []).length).join(','), 'scj:', JSON.stringify(td.scj).substring(0, 60));
    tsData = JSON.stringify(td);
  } catch (e) { console.log('提取 $_ts 失败:', e.message.substring(0, 80)); }

  for (let round = 1; round <= 15; round++) {
    console.log(`\n=== 第 ${round} 轮 ===`);
    const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false });
    const sandbox = env.sandbox;
    // ★ polyfill getFloat16 + __proxy 万能容错（每轮新 sandbox）
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
      window.__proxy = function() {
        return new Proxy(function(){}, {
          get: function(t, p) { return window.__proxy(); },
          set: function(t, p, v) { return true; },
        });
      };
      __proxy = window.__proxy;
      try { window['__proxy'] = __proxy; } catch(e){}
    `, sandbox);
    // ★ 注入 $_ts（动态代码入口依赖 $_ts.scj/$_ts.aebi）
    if (tsData && tsData !== 'null') {
      try { vm.runInContext('window.$_ts = ' + tsData + ';', sandbox); } catch (e) { console.log('注入 $_ts 失败'); }
    }
    const { code: runCode, envTrue } = applyPatches(dynCode, envIds, safeCntRef, disabledOpcodes);
    fs.writeFileSync('/tmp/nx_iter_code.js', runCode);
    console.log('env safe:', safeCntRef.sc, 'disabled op:', safeCntRef.dc, 'envTrue:', envTrue, 'IDs:', [...envIds].join(','), 'disOpcodes:', [...disabledOpcodes].join(','));

    const wrapped = PREFIX + runCode + '; window.__dynOK = true; } catch(__e) { window.__err = { msg: String(__e.message), stack: String(__e.stack) }; throw __e; } })()';
    let errMsg = null, errStack = '';
    const t0 = Date.now();
    try {
      vm.runInContext(wrapped, sandbox, { timeout: 40000, filename: 'wrap.js' });
      console.log('★ 运行完成!');
      // 提取 cookie
      await new Promise(r => setTimeout(r, 5000));
      const diag = vm.runInContext(`JSON.stringify({ dynOK: !!window.__dynOK, cookie: document.cookie, len: (document.cookie||'').length })`, sandbox);
      const d = JSON.parse(diag);
      console.log('cookie:', d.cookie ? d.cookie.substring(0, 60) + '... (len=' + d.len + ')' : '(空)');
      if (d.cookie && d.len > 100) {
        fs.writeFileSync('/tmp/nx_iter_cookie.txt', d.cookie);
        console.log('★ cookie 已保存');
      }
      process.exit(0);
    } catch (e) {
      errMsg = e.message;
      console.log('运行失败:', errMsg.substring(0, 100));
    }
    console.log('耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');

    // 从沙箱拿 stack
    try {
      const er = vm.runInContext('window.__err ? JSON.stringify(window.__err) : "no-err"', sandbox);
      if (er && er !== 'no-err') {
        const e2 = JSON.parse(er);
        errStack = e2.stack || '';
        const wm = errStack.match(/wrap\.js:(\d+):(\d+)/);
        if (wm) {
          const line = +wm[1], col = +wm[2];
          // 精确 line:col → 绝对偏移（wrap 代码可能有换行）
          const wrapLines = wrapped.split('\n');
          let absOff = 0;
          for (let i = 0; i < line - 1 && i < wrapLines.length; i++) absOff += wrapLines[i].length + 1;
          absOff += col - 1;
          const origOff = absOff - PREFIX.length;
          const ctx = runCode.substring(Math.max(0, origOff - 150), origOff + 80);
          console.log('报错位置: line=' + line + ' col=' + col + ' origOff=' + origOff);
          console.log('上下文:', ctx.substring(0, 230));
          // 找环境 ID 调用：XXX(ID, 在上下文里
          const idM = runCode.substring(Math.max(0, origOff - 200), origOff + 60).match(/([_$]\w+)\((\d+),/);
          if (idM) {
            const id = idM[2];
            if (!envIds.has(id)) {
              console.log('★ 发现新环境 ID:', id, '函数:', idM[1]);
              envIds.add(id);
            } else {
              console.log('ID 已知:', id);
            }
          } else {
            console.log('未提取到环境 ID');
            const ctx2 = runCode.substring(Math.max(0, origOff - 500), origOff + 100);
            const idM2 = ctx2.match(/([_$]\w+)\((\d+),/g);
            if (idM2) console.log('上下文 ID 候选:', idM2.slice(0, 8).join(' | '));
          }
          // ★ 提取报错 opcode：origOff 之前最近的 ===数字){（报错所在分支）
          const before = runCode.substring(Math.max(0, origOff - 400), origOff);
          const opMatches = [...before.matchAll(/===\s*(\d+)\)\{/g)];
          if (opMatches.length) {
            const lastOp = opMatches[opMatches.length - 1][1];
            if (!disabledOpcodes.has(lastOp)) {
              console.log('★ 禁用 opcode:', lastOp);
              disabledOpcodes.add(lastOp);
            } else {
              console.log('opcode 已禁用:', lastOp, '（报错仍在，需其他处理）');
            }
          }
        }
      }
    } catch (e) { console.log('读 stack 失败:', e.message.substring(0, 60)); }
  }
  console.log('\n达到最大轮数');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
