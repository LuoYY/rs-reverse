/**
 * query_analyze_v3.js — 用 V8 stack 精确定位异常
 *
 * 关键：之前用 catch logging 的 stack 是 V8 生成的，
 * 但行号/列号是相对于 eval 的代码块。我们需要用 Error.captureStackTrace
 * 或 Error.prepareStackTrace 来获取精确位置。
 *
 * 新方法：在 catch 块中不仅记录 message，还记录：
 * 1. 出错位置前后的变量值（通过 try-catch 包裹关键操作）
 * 2. 用 Error 对象的 lineNumber/columnNumber
 *
 * 更好的方法：直接用 vm.runInContext 的 breakOnSigint 或
 * 在 catch 中注入更多上下文
 *
 * 最有效：对 3 个异常位置做定点 patch（在出错代码前插入 null check）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 异常精确分析 v3 ===\n');

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

  // 找到第 4 行的起始位置
  var nlCount = 0;
  var lineStart = 0;
  for (var i = 0; i < dynCode.length; i++) {
    if (dynCode[i] === '\n') {
      nlCount++;
      if (nlCount === 3) { lineStart = i + 1; break; }
    }
  }
  console.log('Line 4 starts at offset:', lineStart);

  // 三个异常的 V8 列号
  var errorCols = [104784, 82432, 126767];
  errorCols.forEach(function(col) {
    var absPos = lineStart + col;
    // 提取前后 300 字符
    var start = Math.max(0, absPos - 300);
    var end = Math.min(dynCode.length, absPos + 300);
    var before = dynCode.substring(start, absPos);
    var after = dynCode.substring(absPos, end);
    
    // 找到包含此位置的完整函数
    // 往前找 function 关键字
    var funcStart = before.lastIndexOf('function ');
    if (funcStart >= 0) {
      var funcAbsStart = start + funcStart;
      // 提取函数名
      var funcNameMatch = dynCode.substring(funcAbsStart, funcAbsStart + 50).match(/function\s+([_$$a-zA-Z0-9]+)/);
      var funcName = funcNameMatch ? funcNameMatch[1] : 'anonymous';
      console.log('\n=== Col ' + col + ' (abs ' + absPos + ') in function ' + funcName + ' ===');
      console.log('  Before error (last 100 chars): ...' + before.substring(before.length - 100));
      console.log('  At error (next 100 chars): ' + after.substring(0, 100) + '...');
    } else {
      console.log('\n=== Col ' + col + ' (abs ' + absPos + ') ===');
      console.log('  Context: ...' + before.substring(before.length - 100) + ' <<HERE>> ' + after.substring(0, 100) + '...');
    }
  });

  // 更深入：分析 charAt 异常
  // charAt 在 pos lineStart+104784
  // 但 _$gr 函数定义在 pos 142833（不是 104784）
  // 说明 stack 中的 _$gr 不是出错函数，而是调用链
  // 让我们直接在动态代码中搜索 charAt 调用
  console.log('\n\n=== 搜索 charAt 调用 ===');
  var charAtPattern = /\.charAt\s*\(/g;
  var charAtMatch;
  var charAtPositions = [];
  while ((charAtMatch = charAtPattern.exec(dynCode)) !== null) {
    charAtPositions.push(charAtMatch.index);
  }
  console.log('charAt calls found:', charAtPositions.length);
  // 找到最接近 col 104784 的 charAt 调用
  var targetAbs = lineStart + 104784;
  var closest = charAtPositions.reduce(function(prev, curr) {
    return Math.abs(curr - targetAbs) < Math.abs(prev - targetAbs) ? curr : prev;
  });
  console.log('Closest charAt to col 104784 (abs', targetAbs, '): at', closest, '(diff:', Math.abs(closest - targetAbs), ')');
  // 显示这个 charAt 调用的上下文
  var cs = Math.max(0, closest - 200);
  var ce = Math.min(dynCode.length, closest + 200);
  console.log('Context:');
  console.log(dynCode.substring(cs, ce));

  // 分析异常 2: _$at[_$iJ[27]] is not a function
  // 找到 _$bi 函数（pos 137104）
  console.log('\n\n=== _$bi 函数分析 ===');
  var biStart = 137104;
  // 但实际位置可能因为不同会话有偏移，搜索 function _$bi
  var biSearch = dynCode.indexOf('function _$bi(');
  if (biSearch >= 0) {
    var biBrace = dynCode.indexOf('{', biSearch);
    var biDepth = 0;
    var biEnd = biBrace;
    for (var k = biBrace; k < dynCode.length; k++) {
      if (dynCode[k] === '{') biDepth++;
      else if (dynCode[k] === '}') { biDepth--; if (biDepth === 0) { biEnd = k; break; } }
    }
    var biBody = dynCode.substring(biSearch, biEnd + 1);
    console.log('_$bi at pos', biSearch, ', length:', biBody.length);
    console.log('Body:', biBody);
  }

  // 搜索 col 126767 附近的 _$iJ
  console.log('\n\n=== col 126767 附近分析 ===');
  var abs126770 = lineStart + 126767;
  var ctx126770 = dynCode.substring(abs126770 - 500, abs126770 + 500);
  // 找到这个位置所在的函数
  var funcBefore126770 = ctx126770.lastIndexOf('function ');
  if (funcBefore126770 >= 0) {
    // 往前搜索更多
    var searchStart = Math.max(0, abs126770 - 2000);
    var searchRegion = dynCode.substring(searchStart, abs126770);
    var lastFunc = searchRegion.lastIndexOf('function ');
    if (lastFunc >= 0) {
      var funcAbs = searchStart + lastFunc;
      var funcNameM = dynCode.substring(funcAbs, funcAbs + 60).match(/function\s+([_$$a-zA-Z0-9]+)\s*\(([^)]*)\)/);
      if (funcNameM) {
        console.log('Col 126770 is in function:', funcNameM[1], '(', funcNameM[2], ')');
        console.log('Function starts at:', funcAbs);
      }
    }
  }

  // 搜索 _$iJ 定义
  console.log('\n\n=== _$iJ 定义搜索 ===');
  var ijPattern2 = /_\$iJ\s*=/g;
  var ijMatch2;
  while ((ijMatch2 = ijPattern2.exec(dynCode)) !== null) {
    var ijPos = ijMatch2.index;
    var ijCtx = dynCode.substring(ijPos, Math.min(dynCode.length, ijPos + 200));
    console.log('_$iJ at pos', ijPos, ':', ijCtx.substring(0, 150));
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
