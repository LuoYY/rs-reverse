/**
 * query_analyze_v4.js — 用 V8 精确 stack trace 定位异常
 *
 * 方法：patch catch 块，用 Error 对象的 stack 信息精确到行列号
 * 然后在动态代码中提取该位置的代码
 *
 * 关键改进：在 catch 中记录 (new Error()).stack 的完整 V8 stack
 * V8 stack 包含精确的行列号
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== V8 精确 stack trace 定位异常 ===\n');

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

  // 分析动态代码结构
  var lines = dynCode.split('\n');
  console.log('Lines in dynCode:', lines.length);
  lines.forEach(function(line, i) {
    if (line.length > 0) console.log('  Line ' + (i+1) + ': length=' + line.length + ' starts with: ' + line.substring(0, 80));
  });

  // Patch catch blocks — 记录完整的 V8 stack
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched = dynCode;
  var match;
  var patchCount = 0;
  var offset = 0;
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset;
    // 记录完整 stack
    var insert = 'if(!window.__ce)window.__ce=[];window.__ce.push({msg:(' + errVar + '&&' + errVar + '.message?' + errVar + '.message.substring(0,120):String(' + errVar + ').substring(0,120)),stack:(' + errVar + '&&' + errVar + '.stack?' + errVar + '.stack:"no-stack")});';
    patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
    offset += insert.length;
    patchCount++;
  }
  console.log('Patched', patchCount, 'catch blocks');

  // 构建沙箱执行
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  env2.sandbox.XMLHttpRequest = RSXHR2;

  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, patched); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  vm.runInContext('window.__ce = []', env2.proxied);

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
    console.log('Result: "' + String(result).substring(0, 80) + '" (length:', typeof result === 'string' ? result.length : 0, ')');

    var catches = vm.runInContext('window.__ce || []', env2.proxied);
    console.log('\n=== Catches:', catches.length, '===');
    
    // 解析每个 catch 的 stack，提取 dyn.js:LINE:COL
    catches.forEach(function(c, i) {
      console.log('\n[Catch ' + i + '] msg:', c.msg);
      if (c.stack) {
        // V8 stack 格式： "    at FunctionName (dyn.js:LINE:COL)"
        var stackLines = c.stack.split('\n');
        stackLines.forEach(function(sl, j) {
          if (sl.trim()) console.log('  ' + sl.trim());
        });
        
        // 提取 dyn.js:LINE:COL
        var posMatches = [...c.stack.matchAll(/dyn\.js:(\d+):(\d+)/g)];
        if (posMatches.length > 0) {
          var firstPos = posMatches[0];
          var lineNum = parseInt(firstPos[1]);
          var colNum = parseInt(firstPos[2]);
          console.log('\n  → First error at dyn.js line', lineNum, 'col', colNum);
          
          // 在 patched 代码中定位
          var patchedLines = patched.split('\n');
          if (lineNum <= patchedLines.length) {
            var errorLine = patchedLines[lineNum - 1];
            var errorCol = colNum - 1; // 0-indexed
            if (errorCol < errorLine.length) {
              var ctxStart = Math.max(0, errorCol - 100);
              var ctxEnd = Math.min(errorLine.length, errorCol + 100);
              console.log('  Code at error:');
              console.log('    ' + errorLine.substring(ctxStart, errorCol) + ' <<ERROR>> ' + errorLine.substring(errorCol, ctxEnd));
            }
          }
        }
      }
    });

    // 保存完整 catch 数据
    fs.writeFileSync(
      path.join(ROOT, 'output/capture-20080/catch-detail-v4.json'),
      JSON.stringify({ catches, nsd, cd, dynCodeLen: dynCode.length, patchedLen: patched.length, timestamp: new Date().toISOString() }, null, 2)
    );
    console.log('\nSaved to output/capture-20080/catch-detail-v4.json');
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
