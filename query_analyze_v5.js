/**
 * query_analyze_v5.js — 逐个异常定点 patch + 变量值追踪
 *
 * 4 个异常的精确位置和代码：
 * 0. charAt at _$im (5:42788): _$lp[56][_$a9[52]](_$$X[_$$f],0) !== _$ly
 *    → _$lp[56] 是 charAt, _$$X[_$$f] 是 null/undefined
 *    → 发生在 XHR.open 调用时
 * 1. length at _$_s (5:137605): _$iV[_$$X] — undefined.length
 *    → VM dispatcher 中某个值是 undefined
 * 2. call at _$_s (5:137253): _$iV[_$hJ](_$i3[_$$X],_$i3[_$$X+1])
 *    → VM dispatcher 中某个方法调用失败
 * 3. not-a-fn at _$ig (5:68114): _$eC[_$iE[27]](0,_$bb[2])
 *    → _$eC 上某个属性应该是函数但不是
 *
 * 策略：
 * 1. 在每个出错位置前插入变量值记录
 * 2. 理解每个变量的期望类型和实际值
 * 3. 针对性修复沙箱环境
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 异常变量追踪 v5 ===\n');

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

  // 分析动态代码行结构
  var lines = dynCode.split('\n');
  var line5 = lines[4]; // 0-indexed
  console.log('Line 5 length:', line5.length);

  // 1. charAt 异常 at col 42788
  // 代码: _$lp[56][_$a9[52]](_$$X[_$$f],0)
  // _$a9[52] 可能是 'charAt' 或 'indexOf'
  // 我们需要知道 _$a9[52] 的值
  // _$a9 是一个字符串数组（方法名表）
  console.log('\n=== 异常 0: charAt at col 42788 ===');
  var col0 = 42787; // 0-indexed
  var ctx0 = line5.substring(col0 - 200, col0 + 200);
  console.log('Context:', ctx0);

  // 2. length 异常 at col 137605
  console.log('\n=== 异常 1: length at col 137605 ===');
  var col1 = 137604;
  var ctx1 = line5.substring(col1 - 200, col1 + 200);
  console.log('Context:', ctx1);

  // 3. call 异常 at col 137253
  console.log('\n=== 异常 2: call at col 137253 ===');
  var col2 = 137252;
  var ctx2 = line5.substring(col2 - 200, col2 + 200);
  console.log('Context:', ctx2);

  // 4. not-a-function at col 68114
  console.log('\n=== 异常 3: not-a-fn at col 68114 ===');
  var col3 = 68113;
  var ctx3 = line5.substring(col3 - 200, col3 + 200);
  console.log('Context:', ctx3);

  // 策略：在出错位置前插入 try-catch + 变量值记录
  // 但由于代码被混淆且在一行中，很难精确插入
  // 更好的方法：用 Proxy 包装关键对象来追踪

  // 让我们先理解调用链
  // 异常 0 发生在 XHR.open → _$bG → _$_s → _$bG → _$_s → _$gs → _$im
  // _$im 函数在 col 42788 附近
  // 让我们找到 _$im 的完整定义
  console.log('\n\n=== _$im 函数定义 ===');
  var imStart = line5.indexOf('function _$im(');
  if (imStart >= 0) {
    var imBrace = line5.indexOf('{', imStart);
    var imDepth = 0;
    var imEnd = imBrace;
    for (var i = imBrace; i < line5.length; i++) {
      if (line5[i] === '{') imDepth++;
      else if (line5[i] === '}') { imDepth--; if (imDepth === 0) { imEnd = i; break; } }
    }
    var imBody = line5.substring(imStart, imEnd + 1);
    console.log('_$im at col', imStart, ', length:', imBody.length);
    console.log('Body (first 500):', imBody.substring(0, 500));
  }

  // 找到 _$gs 函数（调用 _$im 的）
  console.log('\n\n=== _$gs 函数定义 ===');
  var gsStart = line5.indexOf('function _$gs(');
  if (gsStart >= 0) {
    var gsBrace = line5.indexOf('{', gsStart);
    var gsDepth = 0;
    var gsEnd = gsBrace;
    for (var i = gsBrace; i < line5.length; i++) {
      if (line5[i] === '{') gsDepth++;
      else if (line5[i] === '}') { gsDepth--; if (gsDepth === 0) { gsEnd = i; break; } }
    }
    var gsBody = line5.substring(gsStart, gsEnd + 1);
    console.log('_$gs at col', gsStart, ', length:', gsBody.length);
    console.log('Body (first 800):', gsBody.substring(0, 800));
  }

  // 找到 _$ig 函数（异常 3）
  console.log('\n\n=== _$ig 函数定义 ===');
  var igStart = line5.indexOf('function _$ig(');
  if (igStart >= 0) {
    var igBrace = line5.indexOf('{', igStart);
    var igDepth = 0;
    var igEnd = igBrace;
    for (var i = igBrace; i < line5.length; i++) {
      if (line5[i] === '{') igDepth++;
      else if (line5[i] === '}') { igDepth--; if (igDepth === 0) { igEnd = i; break; } }
    }
    var igBody = line5.substring(igStart, igEnd + 1);
    console.log('_$ig at col', igStart, ', length:', igBody.length);
    console.log('Body:', igBody);
  }

  // 找到 _$$e 函数（被 _$ig 调用）
  console.log('\n\n=== _$$e 函数定义 ===');
  var eStart = line5.indexOf('function _$$e(');
  if (eStart >= 0) {
    var eBrace = line5.indexOf('{', eStart);
    var eDepth = 0;
    var eEnd = eBrace;
    for (var i = eBrace; i < line5.length; i++) {
      if (line5[i] === '{') eDepth++;
      else if (line5[i] === '}') { eDepth--; if (eDepth === 0) { eEnd = i; break; } }
    }
    var eBody = line5.substring(eStart, eEnd + 1);
    console.log('_$$e at col', eStart, ', length:', eBody.length);
    console.log('Body:', eBody);
  }

  // 关键：找到 _$iE 数组定义（_$iE[27] 是方法名）
  console.log('\n\n=== _$iE 数组搜索 ===');
  var iePattern = /_\$iE\s*=/g;
  var ieMatch;
  while ((ieMatch = iePattern.exec(line5)) !== null) {
    var iePos = ieMatch.index;
    var ieCtx = line5.substring(iePos, Math.min(line5.length, iePos + 300));
    console.log('_$iE at col', iePos, ':', ieCtx.substring(0, 250));
    console.log('');
  }

  // 找到 _$a9 数组定义（_$a9[52] 是方法名）
  console.log('\n\n=== _$a9 数组搜索 ===');
  var a9Pattern = /_\$a9\s*=/g;
  var a9Match;
  while ((a9Match = a9Pattern.exec(line5)) !== null) {
    var a9Pos = a9Match.index;
    var a9Ctx = line5.substring(a9Pos, Math.min(line5.length, a9Pos + 300));
    console.log('_$a9 at col', a9Pos, ':', a9Ctx.substring(0, 250));
    console.log('');
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
