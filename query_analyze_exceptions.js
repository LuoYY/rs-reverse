/**
 * query_analyze_exceptions.js — 深入分析 3 个剩余异常
 *
 * 从动态代码中提取出错位置的代码片段，理解每个异常的根因
 * 异常列表：
 * 0. charAt on null/undefined at _$gr (104784) ← _$l3 (10534) ← _$eo (81080)
 * 1. undefined.length at _$eo (82432) ← _$iC (89276) ← _$eo (81446) ← _$f9 (80196)
 * 2. _$at[_$iJ[27]] is not a function at _$bi (126767) ← _$eo (81652) ← _$f9 (80196)
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 深入分析 3 个异常 ===\n');

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

  // 分析出错位置的代码
  // dynCode 是一行（或少数几行），列号就是字符偏移
  // 提取每个出错位置前后 200 字符的代码片段
  const errorPositions = [
    { name: 'charAt-exception', positions: [104784, 10534, 81080] },
    { name: 'length-exception', positions: [82432, 89276, 81446, 80196] },
    { name: 'not-a-function', positions: [126767, 81652, 80196] },
  ];

  errorPositions.forEach(function(err) {
    console.log('\n=== ' + err.name + ' ===');
    err.positions.forEach(function(pos, i) {
      var start = Math.max(0, pos - 100);
      var end = Math.min(dynCode.length, pos + 100);
      var snippet = dynCode.substring(start, end);
      // 找到 pos 在 snippet 中的相对位置
      var relPos = pos - start;
      console.log('\n  [pos ' + pos + '] context:');
      console.log('  ' + snippet.substring(0, relPos) + ' <<HERE>> ' + snippet.substring(relPos));
    });
  });

  // 更深入分析：找到函数定义
  // 找 _$gr, _$l3, _$eo, _$iC, _$f9, _$bi 函数定义
  console.log('\n\n=== 函数定义分析 ===');
  var funcNames = ['_$gr', '_$l3', '_$eo', '_$iC', '_$f9', '_$bi'];
  funcNames.forEach(function(fn) {
    // 找 function _$xx 或 _$xx=function 或 _$xx(
    var patterns = [
      new RegExp('function\\s+' + fn.replace(/\$/g, '\\$') + '\\s*\\(', 'g'),
      new RegExp(fn.replace(/\$/g, '\\$') + '\\s*=\\s*function', 'g'),
    ];
    patterns.forEach(function(pat, pi) {
      var match;
      while ((match = pat.exec(dynCode)) !== null) {
        var defStart = match.index;
        var defEnd = Math.min(dynCode.length, defStart + 300);
        console.log('\n' + fn + ' definition (pattern ' + pi + ', pos ' + defStart + '):');
        console.log('  ' + dynCode.substring(defStart, defEnd).substring(0, 280));
      }
    });
  });

  // 特别分析异常 2: _$at[_$iJ[27]] is not a function
  // _$iJ 是某个数组，[27] 是索引，找到 _$iJ 的定义和 [27] 的值
  console.log('\n\n=== _$iJ 和 _$at 分析 ===');
  // 找 _$iJ= 或 var _$iJ
  var ijPattern = /(_\$iJ)\s*=\s*([^;]{10,500})/g;
  var ijMatch;
  while ((ijMatch = ijPattern.exec(dynCode)) !== null) {
    console.log('_$iJ at pos ' + ijMatch.index + ': ' + ijMatch[2].substring(0, 200));
  }

  // 找 _$at= 
  var atPattern = /(_\$at)\s*=\s*([^;]{10,500})/g;
  var atMatch;
  while ((atMatch = atPattern.exec(dynCode)) !== null) {
    console.log('_$at at pos ' + atMatch.index + ': ' + atMatch[2].substring(0, 200));
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
