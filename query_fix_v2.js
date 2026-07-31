/**
 * query_fix_v2.js — 逐个修复异常
 *
 * 异常分析（精确位置）：
 * 0. charAt at _$dS: _$j2[56][_$_g[52]](_$kR[_$_3],0)
 *    → _$kR[_$_3] 是 null/undefined
 *    → _$kR 是 open() 的参数解析结果
 *    → _$_3 是某个索引
 *    → 发生在 XHR.open() hook 中
 *
 * 1. length at _$i_: _$k0[_$kR] → undefined.length
 *    → VM dispatcher 中某个值是 undefined
 *
 * 2. call at _$i_: _$k0[_$g2] → undefined.call()
 *    → VM dispatcher 中方法调用失败
 *
 * 3. not-a-fn at _$jI: _$hR[_$a_[27]](0,_$f6[2])
 *    → _$hR 上某个属性应该是函数
 *    → _$a_[27] 是方法名字符串
 *
 * 策略：
 * 1. 异常 0 是根因（charAt on null），发生在 XHR.open hook 中
 *    → open() 的某个参数是 null/undefined
 *    → RS 在 open() 中解析 URL，对 URL 调用 charAt
 *    → 可能是 open() 的第三个参数（async）或 URL 本身
 *    → 我们的 XHR stub 可能缺少 RS 期望的属性
 *
 * 2. 异常 3 中 _$hR[_$a_[27]] → 需要 _$a_[27] 的值
 *    → _$a_ 是字符串数组（方法名表）
 *    → _$a_[27] 可能是 'substr'/'slice'/'split' 等
 *    → _$hR 可能是某个 DOM 对象或 navigator 属性
 *
 * 方法：在运行时提取 _$a_ 数组的值
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 逐个修复异常 v2 ===\n');

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

  // 在动态代码中搜索关键变量定义
  // 异常 0: _$j2[56][_$_g[52]](_$kR[_$_3],0)
  // _$j2 和 _$_g 是数组（字符串表/常量表）
  // 需要找到它们的定义来知道 [56] 和 [52] 的值

  // 方法：在沙箱中执行后，从 window 上提取这些变量
  // 但这些变量是函数内部的局部变量
  // 需要在代码中插入 window.__xxx = xxx 来导出

  // 找到 _$dS 函数（charAt 异常发生处）
  // 从 v10 的输出：在 patched line 4 col 151321
  // patched 代码的 line 4 = 原始代码的 line 2（因为 patch 可能改变行号）
  // 让我们直接搜索 _$dS 函数定义

  // 搜索 function _$dS
  var dSPos = dynCode.indexOf('function _$dS(');
  if (dSPos >= 0) {
    var dSBrace = dynCode.indexOf('{', dSPos);
    var dSDepth = 0;
    var dSEnd = dSBrace;
    for (var i = dSBrace; i < dynCode.length; i++) {
      if (dynCode[i] === '{') dSDepth++;
      else if (dynCode[i] === '}') { dSDepth--; if (dSDepth === 0) { dSEnd = i; break; } }
    }
    var dSBody = dynCode.substring(dSPos, dSEnd + 1);
    console.log('\n=== _$dS function (charAt exception) ===');
    console.log('Position:', dSPos, 'Length:', dSBody.length);
    console.log('Body:');
    console.log(dSBody);
  }

  // 搜索 _$jI 函数（not-a-fn 异常）
  var jIPos = dynCode.indexOf('function _$jI(');
  if (jIPos >= 0) {
    var jIBody = dynCode.substring(jIPos, jIPos + 500);
    console.log('\n=== _$jI function (not-a-fn exception) ===');
    console.log('Position:', jIPos);
    console.log('Body:', jIBody);
  }

  // 搜索 _$kA 函数（被 _$jI 调用，处理 _$hR[_$a_[27]]）
  var kAPos = dynCode.indexOf('function _$kA(');
  if (kAPos >= 0) {
    var kABody = dynCode.substring(kAPos, kAPos + 500);
    console.log('\n=== _$kA function ===');
    console.log('Position:', kAPos);
    console.log('Body:', kABody);
  }

  // 搜索 _$i_ 函数（VM dispatcher，异常 1 和 2 发生处）
  var i_Pos = dynCode.indexOf('function _$i_(');
  if (i_Pos >= 0) {
    var i_Brace = dynCode.indexOf('{', i_Pos);
    var i_Depth = 0;
    var i_End = i_Brace;
    for (var i = i_Brace; i < dynCode.length; i++) {
      if (dynCode[i] === '{') i_Depth++;
      else if (dynCode[i] === '}') { i_Depth--; if (i_Depth === 0) { i_End = i; break; } }
    }
    var i_Body = dynCode.substring(i_Pos, i_End + 1);
    console.log('\n=== _$i_ function (VM dispatcher) ===');
    console.log('Position:', i_Pos, 'Length:', i_Body.length);
    console.log('Body (first 1000):');
    console.log(i_Body.substring(0, 1000));
    if (i_Body.length > 1000) console.log('... (' + (i_Body.length - 1000) + ' more chars)');
  }

  // 现在尝试另一种方法：在运行时导出关键变量
  // 在 _$dS 函数前插入 window.__dS_args = arguments
  console.log('\n\n=== 运行时变量导出 ===');

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

  // 在 _$dS 函数中插入变量导出
  // _$dS 函数体开头插入 logging
  var patched2 = dynCode;
  if (dSPos >= 0) {
    var dSBodyStart = dynCode.indexOf('{', dSPos) + 1;
    // 在函数体开头插入
    var exportCode = 'if(!window.__dS)window.__dS=[];try{window.__dS.push({args:Array.from(arguments).map(function(a){return typeof a==="object"?JSON.stringify(a).substring(0,100):String(a).substring(0,100)})});}catch(_$ignore){}';
    patched2 = dynCode.substring(0, dSBodyStart) + exportCode + dynCode.substring(dSBodyStart);
  }

  // 在 _$jI 函数中插入变量导出
  if (jIPos >= 0) {
    var jIBodyStart = dynCode.indexOf('{', jIPos) + 1;
    var jIExport = 'if(!window.__jI)window.__jI=[];try{window.__jI.push({hR_type:typeof _$hR,hR_keys:_$hR?Object.keys(_$hR).slice(0,20).join(","):"null",hR_val:String(_$hR).substring(0,100)});}catch(_$ignore){}';
    // 需要在 patched2 中找到正确位置
    var jIBodyStart2 = patched2.indexOf('{', patched2.indexOf('function _$jI(')) + 1;
    patched2 = patched2.substring(0, jIBodyStart2) + jIExport + patched2.substring(jIBodyStart2);
  }

  // 执行 patched2
  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, patched2); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 清空
  vm.runInContext('window.__dS = []; window.__jI = []', env2.proxied);

  // 触发 trampoline
  console.log('\n[Step] 触发 trampoline...');
  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  if (tramp) {
    var result = '';
    try { result = tramp.call(xhr, '{}') || ''; } catch(e) { console.log('Trampoline threw:', e.message); }
    console.log('Result: "' + String(result).substring(0, 80) + '"');

    // 检查导出的变量
    var dSLogs = vm.runInContext('window.__dS || []', env2.proxied);
    console.log('\n=== _$dS calls:', dSLogs.length, '===');
    dSLogs.forEach(function(log, i) {
      console.log('  [' + i + '] args:', JSON.stringify(log.args));
    });

    var jILogs = vm.runInContext('window.__jI || []', env2.proxied);
    console.log('\n=== _$jI calls:', jILogs.length, '===');
    jILogs.forEach(function(log, i) {
      console.log('  [' + i + ']', JSON.stringify(log));
    });
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
