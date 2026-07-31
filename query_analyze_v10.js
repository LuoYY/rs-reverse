/**
 * query_analyze_v10.js — 直接在运行时捕获异常变量值
 *
 * 之前的方法试图从代码文本定位异常，但变量名每次会话变化
 * 新方法：直接 hook 关键操作来捕获异常时的变量值
 *
 * 策略：
 * 1. 在沙箱中设置全局 error handler
 * 2. 用 try-catch 包裹整个 trampoline 调用
 * 3. 在 catch 中检查 Error 对象的所有属性
 * 4. 用 Proxy 追踪 undefined 返回值
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 运行时异常变量追踪 v10 ===\n');

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

  // 关键改进：不 patch catch blocks
  // 而是用 vm 的 --stack-trace-limit 和 Error.prepareStackTrace
  // 在沙箱中设置全局 error 捕获
  
  // 构建增强沙箱
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  env2.sandbox.XMLHttpRequest = RSXHR2;

  // 在沙箱中设置 Error.prepareStackTrace 来获取精确位置
  // Error.prepareStackTrace 可以获取 CallSite 对象，包含 getColumnNumber() 等
  env2.sandbox.Error.prepareStackTrace = function(err, stack) {
    return { message: err.message, stack: stack };
  };

  // 执行原始动态代码
  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, code); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 恢复正常 stack
  delete env2.sandbox.Error.prepareStackTrace;

  // Patch catch blocks — 记录完整 stack（用正常 V8 格式）
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched = dynCode;
  var match2;
  var offset2 = 0;
  while ((match2 = catchPattern.exec(dynCode)) !== null) {
    var errVar = match2[1];
    var insertPos = match2.index + match2[0].length + offset2;
    // 用 JSON.stringify 来安全记录 error
    var insert = 'if(!window.__ce)window.__ce=[];try{window.__ce.push({msg:String(' + errVar + '&&' + errVar + '.message||' + errVar + ').substring(0,150),stack:String(' + errVar + '&&' + errVar + '.stack||"").substring(0,500)});}catch(_$ignore){}';
    patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
    offset2 += insert.length;
  }
  console.log('Patched:', patched.length, 'bytes');

  // 重新执行 patched 代码
  const env3 = buildEnv({ nsd, cd }, { seedCookie });
  env3.sandbox.document = new Proxy(env3.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR3() {}
  RSXHR3.prototype = {};
  for (const key in RSXHR.prototype) RSXHR3.prototype[key] = RSXHR.prototype[key];
  env3.sandbox.XMLHttpRequest = RSXHR3;

  const origEval3 = env3.sandbox.eval;
  let done3 = false;
  env3.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done3) { done3 = true; return origEval3.call(this, patched); }
    return origEval3.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env3.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  vm.runInContext('window.__ce = []', env3.proxied);

  // 触发 trampoline
  console.log('\n[Step] 触发 trampoline...');
  const xhr = new RSXHR3();
  RSXHR3.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  if (tramp) {
    var result = '';
    try { result = tramp.call(xhr, '{}') || ''; } catch(e) { console.log('Trampoline threw:', e.message); }
    console.log('Result: "' + String(result).substring(0, 80) + '" (length:', typeof result === 'string' ? result.length : 0, ')');

    var catches = vm.runInContext('window.__ce || []', env3.proxied);
    console.log('\n=== Catches:', catches.length, '===');
    
    // 收集所有唯一异常
    var seen = new Set();
    catches.forEach(function(c, i) {
      var key = c.msg;
      if (seen.has(key)) return;
      seen.add(key);
      
      console.log('\n[Catch ' + i + '] msg:', c.msg);
      if (c.stack) {
        // V8 stack 格式
        var slines = c.stack.split('\n');
        slines.forEach(function(sl) {
          if (sl.trim()) console.log('  ' + sl.trim());
        });

        // 提取 dyn.js:LINE:COL
        var posMatches = [...c.stack.matchAll(/dyn\.js:(\d+):(\d+)/g)];
        if (posMatches.length > 0) {
          // 第一个是出错位置
          var firstPos = posMatches[0];
          var lineNum = parseInt(firstPos[1]);
          var colNum = parseInt(firstPos[2]);
          console.log('\n  → Error at dyn.js line', lineNum, 'col', colNum);
          
          // 在 patched 代码中定位
          var pLineStarts = [0];
          for (var pi = 0; pi < patched.length; pi++) {
            if (patched[pi] === '\n') pLineStarts.push(pi + 1);
          }
          
          if (lineNum <= pLineStarts.length) {
            var plStart = pLineStarts[lineNum - 1];
            var plEnd = lineNum < pLineStarts.length ? pLineStarts[lineNum] - 1 : patched.length;
            var plContent = patched.substring(plStart, plEnd);
            var col0 = colNum - 1;
            
            if (col0 < plContent.length) {
              var cs = Math.max(0, col0 - 200);
              var ce = Math.min(plContent.length, col0 + 200);
              console.log('  Code at error:');
              console.log('    ...' + plContent.substring(cs, col0));
              console.log('    <<ERROR>>' + plContent.substring(col0, ce) + '...');
              
              // 找到包含此位置的函数
              var funcSearch = plContent.substring(0, col0);
              var lastFunc = funcSearch.lastIndexOf('function ');
              if (lastFunc >= 0) {
                var funcMatch = plContent.substring(lastFunc, lastFunc + 80).match(/function\s+([_$$a-zA-Z0-9]+)/);
                if (funcMatch) {
                  console.log('  In function:', funcMatch[1]);
                }
              }
            } else {
              console.log('  Col ' + colNum + ' beyond line ' + lineNum + ' (length ' + plContent.length + ')');
            }
          }
        }
      }
    });
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
