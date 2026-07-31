/**
 * query_analyze_v9.js — 找到 V8 stack 的正确行映射
 *
 * V8 stack 报 dyn.js:5:42788 但 line 5 只有 38707 字符
 * 说明 V8 的行号映射和我们的不一致
 *
 * 可能原因：catch logging patch 改变了代码结构
 * V8 stack 是在 patched 代码执行时生成的
 *
 * 方法：patch catch blocks 时记录 patched 代码的行结构
 * 然后用 patched 代码定位
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== V8 stack 正确行映射 v9 ===\n');

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
  var patchedLineStarts = [0];
  for (var i = 0; i < patched.length; i++) {
    if (patched[i] === '\n') patchedLineStarts.push(i + 1);
  }
  console.log('Patched total lines:', patchedLineStarts.length);
  console.log('Patched line starts:', patchedLineStarts);
  
  // 打印每行长度
  for (var li = 0; li < patchedLineStarts.length; li++) {
    var ls = patchedLineStarts[li];
    var le = li + 1 < patchedLineStarts.length ? patchedLineStarts[li + 1] - 1 : patched.length;
    var llen = le - ls;
    if (llen > 0) {
      console.log('  Line ' + (li + 1) + ': length=' + llen + ' starts: ' + patched.substring(ls, ls + 60));
    } else {
      console.log('  Line ' + (li + 1) + ': empty');
    }
  }

  // V8 stack 报 dyn.js:5:42788
  // 在 patched 代码中，line 5 是什么？
  if (patchedLineStarts.length >= 5) {
    var l5s = patchedLineStarts[4];
    var l5e = patchedLineStarts.length >= 6 ? patchedLineStarts[5] - 1 : patched.length;
    var l5 = patched.substring(l5s, l5e);
    console.log('\nPatched Line 5: start=' + l5s + ', length=' + l5.length);
    console.log('First 80:', l5.substring(0, 80));

    // 检查 col 42788 是否在此行范围内
    var errors = [
      { name: 'charAt', col: 42788 },
      { name: 'not-a-fn', col: 68114 },
    ];
    errors.forEach(function(err) {
      var col0 = err.col - 1;
      if (col0 < l5.length) {
        console.log('\n=== ' + err.name + ' at patched line 5 col ' + err.col + ' ===');
        console.log('  ...' + l5.substring(Math.max(0, col0 - 150), col0));
        console.log('  <<HERE>>' + l5.substring(col0, Math.min(l5.length, col0 + 150)) + '...');
      } else {
        console.log('\n' + err.name + ' col ' + err.col + ' BEYOND patched line 5 (len=' + l5.length + ')');
        // 尝试其他行
        // 搜索全部 patched 代码
        // V8 可能对 eval 的代码做了不同的行号计算
        // 让我们搜索特征字符串
      }
    });
  }

  // 另一种方法：直接在 patched 代码中搜索特征字符串
  // 从 v4 的输出中我们知道：
  // Catch 0: _$lp[56][_$a9[52]](_$$X[_$$f],0)!==_$ly
  // Catch 3: _$eC[_$iE[27]](0,_$bb[2])
  console.log('\n\n=== 直接搜索特征字符串 ===');
  var features = [
    '_$a9[52]](_$$X[_$$f],0)',
    '_$iE[27]](0,',
  ];
  features.forEach(function(feat) {
    var pos = patched.indexOf(feat);
    if (pos >= 0) {
      console.log('\nFound "' + feat + '" at patched offset', pos);
      var ctx = patched.substring(Math.max(0, pos - 200), Math.min(patched.length, pos + 200));
      console.log('  ...' + ctx.substring(0, 200));
      console.log('  ...' + ctx.substring(200));
    } else {
      console.log('\n"' + feat + '" NOT found in patched code');
      // 也搜索原始代码
      var origPos = dynCode.indexOf(feat);
      if (origPos >= 0) {
        console.log('  Found in ORIGINAL code at offset', origPos);
        var oCtx = dynCode.substring(Math.max(0, origPos - 200), Math.min(dynCode.length, origPos + 200));
        console.log('  ...' + oCtx.substring(0, 200));
        console.log('  ...' + oCtx.substring(200));
      } else {
        console.log('  NOT found in original code either');
      }
    }
  });

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
