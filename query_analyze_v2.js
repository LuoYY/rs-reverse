/**
 * query_analyze_v2.js — 更精确地定位异常位置
 *
 * 关键发现：stack 中的行号是 dyn.js:4:XXXX
 * dyn.js 是 eval 的动态代码，行 4 表示前面有 3 行换行
 * 需要找到第 4 行的起始位置，然后加上列号
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 精确定位异常位置 v2 ===\n');

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
  var lineStart = 0;
  var lineNum = 1;
  for (var i = 0; i < dynCode.length; i++) {
    if (lineNum === 4) { lineStart = i; break; }
    if (dynCode[i] === '\n') lineNum++;
  }
  console.log('Line 4 starts at char:', lineStart, '(line', lineNum, ')');

  // 如果不到第 4 行，说明整个代码是一行
  if (lineNum < 4) {
    console.log('Code has only', lineNum, 'lines. Stack line:col refers to single-line code.');
    // 对于单行代码，V8 会报 line 1
    // 但 stack 显示 dyn.js:4:XXXX，说明 eval 的代码确实有 4 行
    // 检查前几个字符看有没有换行
    var firstNewline = dynCode.indexOf('\n');
    console.log('First newline at:', firstNewline);
    if (firstNewline > 0) {
      // 找前几个换行的位置
      var nlPositions = [];
      var pos = 0;
      while ((pos = dynCode.indexOf('\n', pos)) !== -1 && nlPositions.length < 10) {
        nlPositions.push(pos);
        pos++;
      }
      console.log('Newline positions:', nlPositions.slice(0, 10));
      // line 4 = 第 3 个换行后
      if (nlPositions.length >= 3) {
        lineStart = nlPositions[2] + 1;
        console.log('Line 4 starts at:', lineStart);
      }
    }
  }

  // 现在用 lineStart + column 来精确定位
  var errors = [
    { name: 'charAt', col: 104784, stack: '_$gr → _$l3 → _$eo' },
    { name: 'length', col: 82432, stack: '_$eo → _$iC → _$eo' },
    { name: 'not-a-fn', col: 126767, stack: '_$bi → _$eo → _$f9' },
  ];

  errors.forEach(function(err) {
    var absPos = lineStart + err.col;
    console.log('\n=== ' + err.name + ' (col ' + err.col + ', abs ' + absPos + ') ===');
    console.log('  Stack: ' + err.stack);
    var start = Math.max(0, absPos - 150);
    var end = Math.min(dynCode.length, absPos + 150);
    var snippet = dynCode.substring(start, end);
    var relPos = absPos - start;
    // 标记出错位置
    console.log('  Code context:');
    var before = snippet.substring(0, relPos);
    var after = snippet.substring(relPos);
    // 分行显示
    console.log('    ...' + before);
    console.log('    <<ERROR HERE>>' + after + '...');
  });

  // 额外分析：找 _$f9 函数（query 生成核心入口）
  console.log('\n\n=== _$f9 函数完整分析 ===');
  var f9Match = dynCode.indexOf('function _$f9(');
  if (f9Match >= 0) {
    // 提取 _$f9 函数体（找匹配的括号）
    var braceStart = dynCode.indexOf('{', f9Match);
    var depth = 0;
    var endPos = braceStart;
    for (var i = braceStart; i < dynCode.length; i++) {
      if (dynCode[i] === '{') depth++;
      else if (dynCode[i] === '}') { depth--; if (depth === 0) { endPos = i; break; } }
    }
    var f9Body = dynCode.substring(f9Match, endPos + 1);
    console.log('_$f9 length:', f9Body.length, 'chars');
    console.log('_$f9 first 500 chars:');
    console.log(f9Body.substring(0, 500));
    console.log('\n... (truncated) ...');
    console.log('_$f9 last 200 chars:');
    console.log(f9Body.substring(f9Body.length - 200));
  }

  // 找 _$fP 函数（在 _$f9 内部定义，解析参数）
  console.log('\n\n=== _$fP 函数分析（在 _$f9 内部）===');
  var fpPattern = /function\s+_\$fP\s*\(([^)]*)\)\s*\{/g;
  var fpMatch;
  while ((fpMatch = fpPattern.exec(dynCode)) !== null) {
    var fpStart = fpMatch.index;
    var fpBrace = dynCode.indexOf('{', fpStart);
    var fpDepth = 0;
    var fpEnd = fpBrace;
    for (var j = fpBrace; j < dynCode.length; j++) {
      if (dynCode[j] === '{') fpDepth++;
      else if (dynCode[j] === '}') { fpDepth--; if (fpDepth === 0) { fpEnd = j; break; } }
    }
    var fpBody = dynCode.substring(fpStart, fpEnd + 1);
    console.log('_$fP at pos', fpStart, ', length:', fpBody.length);
    console.log(fpBody.substring(0, 600));
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
