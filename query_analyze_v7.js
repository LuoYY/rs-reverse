/**
 * query_analyze_v7.js — 在正确的行中定位异常
 *
 * V8 stack 报 dyn.js:5:XXXXX，但 patched 代码的行结构与原始不同
 * 因为 catch logging 插入改变了换行位置
 * 需要找到 V8 实际对应的行
 *
 * 方法：直接在 patched 代码中搜索特征字符串来定位
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 正确定位异常 v7 ===\n');

  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const client = new PmosXjClientProxy();
  await client.init();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;

  // 获取动态代码
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  function RSXHR() {}
  RSXHR.prototype = {
    open: function(m,u) { this._url=String(u); this.readyState=1; },
    send: function() { this.readyState=4; this.status=200; this.responseText='{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    readyState:0, status:0, responseText:'', responseURL:'',
  };
  env1.sandbox.XMLHttpRequest = RSXHR;
  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  if (!dynCode) { console.log('FATAL: dynCode not captured'); process.exit(1); }
  console.log('Dynamic code:', dynCode.length, 'bytes');

  // 不 patch，直接用原始代码 + instrument 关键函数
  // 方法：用 Proxy 包装 Function.prototype.call 来追踪所有函数调用
  
  // 构建沙箱
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  env2.sandbox.XMLHttpRequest = RSXHR2;

  // 执行原始动态代码（不 patch）
  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, code); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 分析动态代码的行结构（不 patch）
  var origLines = dynCode.split('\n');
  console.log('\nOriginal dynCode lines:', origLines.length);
  origLines.forEach(function(line, i) {
    if (line.length > 0) console.log('  Line ' + (i+1) + ': length=' + line.length + ' starts: ' + line.substring(0, 60));
  });

  // V8 的 dyn.js:5:XXXXX 是相对于 eval 的代码
  // eval 的代码就是原始 dynCode（不 patch 时）
  // 但 stack 显示的行列号是 V8 引擎内部的，可能包含 eval wrapper

  // 让我们直接用原始代码定位
  // V8 对于 eval(code) 的 stack：
  // 如果 code 是表达式，行号从 1 开始
  // 如果 code 包含换行，行号对应 code 中的行
  
  // 但 dynCode 有 11 行，且大部分代码在第 5 行
  // 不对，原始代码的行分布：
  // Line 1-4: 短行
  // Line 5: 大量代码
  
  // 但 V8 stack 报的 col 42788 超出了 line 5 的长度
  // 这说明 V8 对 eval 的处理可能不同
  
  // 让我们检查：eval 的代码是否被包裹？
  // sandbox.eval = function(code) { return vm.runInContext(code, ...) }
  // vm.runInContext 会对 code 做间接 eval
  // V8 可能将 code 包裹在 (function(){ ... }) 中
  // 或者 code 本身就是一个大表达式

  // 让我们检查 dynCode 的前几个字符
  console.log('\nFirst 200 chars:', dynCode.substring(0, 200));
  console.log('\nChars around offset 200:', JSON.stringify(dynCode.substring(180, 220)));

  // 如果 dynCode 以 (function(... 开头，那 V8 会把它当作一行
  // 实际的换行在 code 内部
  // 让我们看看 code 中有没有 \n
  var newlines = [];
  for (var i = 0; i < dynCode.length; i++) {
    if (dynCode[i] === '\n') newlines.push(i);
  }
  console.log('\nNewline positions:', newlines);
  
  // 如果只有少数几个换行，大部分代码在一行中
  // V8 报 line 5 说明第 4 个换行后的行
  if (newlines.length >= 4) {
    var line5Start = newlines[3] + 1;
    var line5End = newlines.length >= 5 ? newlines[4] : dynCode.length;
    var line5Content = dynCode.substring(line5Start, line5End);
    console.log('\nLine 5: start=' + line5Start + ', end=' + line5End + ', length=' + line5Content.length);
    console.log('First 80:', line5Content.substring(0, 80));
    
    // 现在在 line5Content 中定位
    var errors = [
      { name: 'charAt', col: 42788 },
      { name: 'length', col: 137605 },
      { name: 'call', col: 137253 },
      { name: 'not-a-fn', col: 68114 },
    ];

    errors.forEach(function(err) {
      var col0 = err.col - 1; // 0-indexed
      if (col0 < line5Content.length) {
        var ctxStart = Math.max(0, col0 - 200);
        var ctxEnd = Math.min(line5Content.length, col0 + 200);
        console.log('\n=== ' + err.name + ' at line 5 col ' + err.col + ' ===');
        console.log('  ...' + line5Content.substring(ctxStart, col0));
        console.log('  <<ERROR>>' + line5Content.substring(col0, ctxEnd) + '...');
      } else {
        console.log('\n=== ' + err.name + ' at col ' + err.col + ' — BEYOND line 5 (len=' + line5Content.length + ') ===');
        // 可能在其他行
        // 搜索全部代码
        var totalOffset = line5Start + col0;
        if (totalOffset < dynCode.length) {
          var s = Math.max(0, totalOffset - 200);
          var e = Math.min(dynCode.length, totalOffset + 200);
          console.log('  Trying absolute offset', totalOffset, ':');
          console.log('  ...' + dynCode.substring(s, totalOffset));
          console.log('  <<ERROR>>' + dynCode.substring(totalOffset, e) + '...');
        }
      }
    });
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
