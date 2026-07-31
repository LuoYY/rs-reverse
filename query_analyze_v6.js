/**
 * query_analyze_v6.js — 在 patched 代码中分析（catch logging 改变了代码结构）
 *
 * 关键发现：V8 的 stack trace 行列号是相对于【eval 的代码】的
 * 而 eval 的代码 = patched dynCode（插入了 catch logging）
 * 所以必须用 patched 代码来定位
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 在 patched 代码中定位异常 v6 ===\n');

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

  // Patch catch blocks
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched = dynCode;
  var match;
  var offset = 0;
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset;
    var insert = 'if(!window.__ce)window.__ce=[];window.__ce.push({msg:(' + errVar + '&&' + errVar + '.message?' + errVar + '.message.substring(0,120):String(' + errVar + ').substring(0,120)),stack:(' + errVar + '&&' + errVar + '.stack?' + errVar + '.stack:"no-stack")});';
    patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
    offset += insert.length;
  }
  console.log('Patched code:', patched.length, 'bytes');

  // 分析 patched 代码的行结构
  var patchedLines = patched.split('\n');
  console.log('Patched lines:', patchedLines.length);
  patchedLines.forEach(function(line, i) {
    if (line.length > 0) console.log('  Line ' + (i+1) + ': length=' + line.length);
  });

  // V8 stack 报的行号是 dyn.js:5:XXXXX
  // dyn.js 是 eval 的 patched 代码
  // 找到第 5 行
  if (patchedLines.length >= 5) {
    var line5 = patchedLines[4]; // 0-indexed
    console.log('\nLine 5 length:', line5.length);
    console.log('Line 5 first 80:', line5.substring(0, 80));

    // 4 个异常的列号
    var errors = [
      { name: 'charAt', col: 42788 },
      { name: 'length', col: 137605 },
      { name: 'call', col: 137253 },
      { name: 'not-a-fn', col: 68114 },
    ];

    errors.forEach(function(err) {
      var col0 = err.col - 1; // V8 col is 1-indexed
      if (col0 < line5.length) {
        var ctxStart = Math.max(0, col0 - 150);
        var ctxEnd = Math.min(line5.length, col0 + 150);
        console.log('\n=== ' + err.name + ' at col ' + err.col + ' ===');
        console.log('  ...' + line5.substring(ctxStart, col0) + ' <<ERROR>> ' + line5.substring(col0, ctxEnd) + '...');
      } else {
        console.log('\n=== ' + err.name + ' at col ' + err.col + ' — BEYOND line 5 (len=' + line5.length + ') ===');
      }
    });

    // 找到 _$im 函数
    console.log('\n\n=== 关键函数定义 ===');
    var funcNames = ['_$im', '_$gs', '_$ig', '_$$e', '_$iE', '_$a9'];
    funcNames.forEach(function(fn) {
      var escapedFn = fn.replace(/\$/g, '\\$');
      // function 定义
      var defPattern = new RegExp('function\\s+' + escapedFn + '\\s*\\(', 'g');
      var defMatch = defPattern.exec(line5);
      if (defMatch) {
        var defStart = defMatch.index;
        var defBrace = line5.indexOf('{', defStart);
        var defDepth = 0;
        var defEnd = defBrace;
        for (var i = defBrace; i < line5.length; i++) {
          if (line5[i] === '{') defDepth++;
          else if (line5[i] === '}') { defDepth--; if (defDepth === 0) { defEnd = i; break; } }
        }
        var defBody = line5.substring(defStart, defEnd + 1);
        console.log('\n' + fn + ' at col ' + defStart + ', length ' + defBody.length + ':');
        console.log(defBody.substring(0, 500));
      } else {
        // 可能是赋值: _$xx=
        var assignPattern = new RegExp(escapedFn + '\\s*=', 'g');
        var assignMatch;
        var count = 0;
        while ((assignMatch = assignPattern.exec(line5)) !== null && count < 3) {
          var aPos = assignMatch.index;
          var aCtx = line5.substring(aPos, Math.min(line5.length, aPos + 200));
          console.log('\n' + fn + ' assignment at col ' + aPos + ':');
          console.log(aCtx.substring(0, 180));
          count++;
        }
      }
    });
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
