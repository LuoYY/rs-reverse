/**
 * query_analyze_v8.js — 用 V8 精确 stack（不 patch catch，用原始代码 + filename）
 *
 * 关键发现：V8 stack 的 dyn.js:LINE:COL 是相对于 eval 代码的
 * 但 eval 代码的行结构受换行符影响
 * dynCode 有多个连续换行（\n\n\n\n）导致行号偏移
 *
 * 新方法：直接用 vm.runInContext 的 filename 参数，
 * 然后用 V8 的 Error.prepareStackTrace 获取精确的 CallSite 对象
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== V8 CallSite 精确定位 v8 ===\n');

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

  // 分析 dynCode 的换行结构
  // dynCode 以 \n 开头，然后有大段代码，中间有 \n\n\n 等
  // V8 对于 eval(code) 的行号处理：
  // - 如果 code 以 \n 开头，V8 可能将第一行视为空行
  // - 行号从 1 开始计数
  
  // 让我们直接计算：对于 dyn.js:5:COL
  // 需要找到第 5 行的起始位置
  var lineStarts = [0]; // 第 1 行从 0 开始
  for (var i = 0; i < dynCode.length; i++) {
    if (dynCode[i] === '\n') lineStarts.push(i + 1);
  }
  console.log('Total lines:', lineStarts.length);
  console.log('Line starts:', lineStarts.slice(0, 15));
  
  // V8 stack 报 line 5
  if (lineStarts.length >= 5) {
    var l5Start = lineStarts[4]; // 第 5 行起始（0-indexed array, line 5 = index 4）
    var l5End = lineStarts.length >= 6 ? lineStarts[5] : dynCode.length;
    var l5Content = dynCode.substring(l5Start, l5End);
    console.log('\nLine 5: start=' + l5Start + ', end=' + l5End + ', length=' + l5Content.length);
    console.log('First 80:', l5Content.substring(0, 80));
    
    // 在第 5 行中定位
    var errors = [
      { name: 'charAt', col: 42788, stack: '_$im → _$gs → _$_s → _$bG → _$_s' },
      { name: 'length', col: 137605, stack: '_$_s → _$hB → _$_s' },
      { name: 'call', col: 137253, stack: '_$_s → _$bG → _$_s' },
      { name: 'not-a-fn', col: 68114, stack: '_$ig → _$_s → _$bG' },
    ];

    errors.forEach(function(err) {
      var col0 = err.col - 1; // V8 col is 1-indexed, convert to 0-indexed
      if (col0 < l5Content.length) {
        var ctxStart = Math.max(0, col0 - 200);
        var ctxEnd = Math.min(l5Content.length, col0 + 200);
        console.log('\n=== ' + err.name + ' at line 5 col ' + err.col + ' ===');
        console.log('  Stack: ' + err.stack);
        console.log('  Context:');
        console.log('    ...' + l5Content.substring(ctxStart, col0));
        console.log('    <<HERE>>' + l5Content.substring(col0, ctxEnd) + '...');
      } else {
        console.log('\n=== ' + err.name + ' at col ' + err.col + ' — BEYOND line 5 ===');
      }
    });

    // 找关键函数
    console.log('\n\n=== 关键函数定义（在第 5 行中搜索）===');
    var funcs = ['function _$im', 'function _$gs', 'function _$ig', 'function _$$e'];
    funcs.forEach(function(fnSig) {
      var pos = l5Content.indexOf(fnSig);
      if (pos >= 0) {
        var bracePos = l5Content.indexOf('{', pos);
        var depth = 0;
        var endPos = bracePos;
        for (var j = bracePos; j < l5Content.length; j++) {
          if (l5Content[j] === '{') depth++;
          else if (l5Content[j] === '}') { depth--; if (depth === 0) { endPos = j; break; } }
        }
        var body = l5Content.substring(pos, endPos + 1);
        console.log('\n' + fnSig + ' at col ' + pos + ', length ' + body.length + ':');
        console.log(body.substring(0, 600));
        if (body.length > 600) console.log('  ...(' + (body.length - 600) + ' more chars)');
      }
    });

    // 找关键变量数组定义
    console.log('\n\n=== 关键数组定义 ===');
    var arrays = ['_$iE', '_$a9', '_$lp'];
    arrays.forEach(function(arr) {
      var pattern = new RegExp(arr.replace(/\$/g, '\\$') + '\\s*=', 'g');
      var match;
      var count = 0;
      while ((match = pattern.exec(l5Content)) !== null && count < 3) {
        var pos = match.index;
        var ctx = l5Content.substring(pos, Math.min(l5Content.length, pos + 200));
        console.log('\n' + arr + ' at col ' + pos + ': ' + ctx.substring(0, 180));
        count++;
      }
    });

  } else {
    console.log('Not enough lines in dynCode');
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
