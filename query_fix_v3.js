/**
 * query_fix_v3.js — 用会话一致的代码定位函数
 *
 * 关键发现：变量名每次会话不同！
 * _$dS, _$jI, _$i_ 等函数名在不同会话中指向不同的函数
 * 必须在同一会话中：获取代码 → 分析 → patch → 执行
 *
 * 新方法：
 * 1. 获取动态代码
 * 2. 用 catch logging 执行，获取异常的 V8 stack
 * 3. 从 stack 中提取函数名和位置
 * 4. 在同一份代码中搜索这些函数的定义
 * 5. 理解异常根因
 * 6. 针对性 patch
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 会话一致分析 + 修复 v3 ===\n');

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

  // Step 1: Patch catch blocks + 执行 + 获取异常
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched = dynCode;
  var match;
  var offset = 0;
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset;
    var insert = 'if(!window.__ce)window.__ce=[];try{window.__ce.push({msg:String(' + errVar + '&&' + errVar + '.message||' + errVar + ').substring(0,150),stack:String(' + errVar + '&&' + errVar + '.stack||"").substring(0,600)});}catch(_$ignore){}';
    patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
    offset += insert.length;
  }

  // 执行 patched
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
  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  var result = '';
  if (tramp) {
    try { result = tramp.call(xhr, '{}') || ''; } catch(e) {}
  }
  console.log('Result: "' + String(result).substring(0, 80) + '"');

  var catches = vm.runInContext('window.__ce || []', env2.proxied);
  console.log('Catches:', catches.length);

  // Step 2: 从 stack 中提取函数名和位置
  // 在 patched 代码中定位
  var patchedLineStarts = [0];
  for (var pi = 0; pi < patched.length; pi++) {
    if (patched[pi] === '\n') patchedLineStarts.push(pi + 1);
  }

  var seen = new Set();
  var errorInfos = [];
  
  catches.forEach(function(c) {
    if (seen.has(c.msg)) return;
    seen.add(c.msg);
    
    var posMatches = [...c.stack.matchAll(/at\s+(\S+)\s+\(dyn\.js:(\d+):(\d+)\)/g)];
    if (posMatches.length > 0) {
      var firstFrame = posMatches[0];
      var funcName = firstFrame[1];
      var lineNum = parseInt(firstFrame[2]);
      var colNum = parseInt(firstFrame[3]);
      
      // 在 patched 代码中定位
      if (lineNum <= patchedLineStarts.length) {
        var lStart = patchedLineStarts[lineNum - 1];
        var lEnd = lineNum < patchedLineStarts.length ? patchedLineStarts[lineNum] - 1 : patched.length;
        var lContent = patched.substring(lStart, lEnd);
        var col0 = colNum - 1;
        
        if (col0 < lContent.length) {
          var ctxStart = Math.max(0, col0 - 100);
          var ctxEnd = Math.min(lContent.length, col0 + 200);
          var code = lContent.substring(ctxStart, ctxEnd);
          
          // 找到包含此位置的函数
          var beforeCode = lContent.substring(0, col0);
          var lastFuncIdx = beforeCode.lastIndexOf('function ');
          var inFunc = '?';
          if (lastFuncIdx >= 0) {
            var fnMatch = lContent.substring(lastFuncIdx, lastFuncIdx + 80).match(/function\s+([_$$a-zA-Z0-9]+)/);
            if (fnMatch) inFunc = fnMatch[1];
          }
          
          errorInfos.push({
            msg: c.msg.substring(0, 80),
            func: funcName,
            inFunc: inFunc,
            line: lineNum,
            col: colNum,
            code: code,
            allFrames: posMatches.map(f => ({ fn: f[1], line: f[2], col: f[3] }))
          });
          
          console.log('\n=== Exception: ' + c.msg.substring(0, 60) + ' ===');
          console.log('  At function:', funcName, '(inside', inFunc + ')');
          console.log('  Position: dyn.js line', lineNum, 'col', colNum);
          console.log('  Code:', code.substring(0, 280));
          console.log('  Call chain:', posMatches.slice(0, 5).map(f => f[1]).join(' → '));
        }
      }
    }
  });

  // Step 3: 分析异常 0 的根因
  // charAt 异常发生在解析 XHR.open() 参数时
  // 关键：_$j2[56][_$_g[52]](_$kR[_$_3],0) → _$kR[_$_3] 是 null
  // _$kR 是 open() 的参数数组，_$_3 是索引
  // 这意味着 open() 的某个参数是 null/undefined

  // RS 在 open() hook 中解析 URL 和方法
  // 如果 open() 的参���不完整，就会出错
  // 我们的 XHR stub 的 open 只接受 (method, url)，但 RS 可能期望更多参数

  // 让我们检查：RS hook open 后的参数处理
  console.log('\n\n=== 分析 charAt 异常根因 ===');
  console.log('charAt 异常发生在 RS 解析 XHR.open() 参数时');
  console.log('可能原因：');
  console.log('1. open() 的某个参数是 null/undefined');
  console.log('2. RS 期望 open() 有用户名/密码参数');
  console.log('3. URL 解析时某个部分为 null');

  // 检查我们的 open() 调用
  console.log('\n我们的 open() 调用:');
  console.log('  RSXHR2.prototype.open.call(xhr, "POST", "/px-gateway/GatewayConfig/getGatewayConfig", true)');
  console.log('  参数: method="POST", url="/px-gateway/...", async=true');
  console.log('  RS 可能期望: open(method, url, async, user, password)');
  console.log('  当 user/password 为 undefined 时，RS 可能尝试 charAt(undefined)');

  // 尝试修复：给 open() 添加默认的 user/password
  console.log('\n\n=== 尝试修复：增强 XHR.open() ===');

  // 构建修复后的 XHR
  const env3 = buildEnv({ nsd, cd }, { seedCookie });
  env3.sandbox.document = new Proxy(env3.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  
  function RSXHR3() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.responseURL = '';
    this.response = '';
    this.responseType = '';
    this.statusText = '';
    this.timeout = 0;
    this.withCredentials = false;
    this.upload = { addEventListener(){}, removeEventListener(){} };
    this.onabort = null;
    this.onerror = null;
    this.onload = null;
    this.onloadend = null;
    this.onloadstart = null;
    this.onprogress = null;
    this.onreadystatechange = null;
    this.ontimeout = null;
    this.UNSENT = 0;
    this.OPENED = 1;
    this.HEADERS_RECEIVED = 2;
    this.LOADING = 3;
    this.DONE = 4;
  }
  RSXHR3.prototype.open = function(method, url, async, user, password) {
    this._method = String(method || 'GET');
    this._url = String(url || '');
    this._async = async !== false;
    this._user = String(user || '');
    this._password = String(password || '');
    this.readyState = 1;
  };
  RSXHR3.prototype.send = function(body) {
    this.readyState = 4;
    this.status = 200;
    this.responseText = '{}';
    this.response = '{}';
  };
  RSXHR3.prototype.setRequestHeader = function() {};
  RSXHR3.prototype.abort = function() {};
  RSXHR3.prototype.overrideMimeType = function() {};
  RSXHR3.prototype.getAllResponseHeaders = function() { return ''; };
  RSXHR3.prototype.getResponseHeader = function() { return null; };
  RSXHR3.prototype.addEventListener = function() {};
  RSXHR3.prototype.removeEventListener = function() {};
  RSXHR3.prototype.dispatchEvent = function() { return true; };
  RSXHR3.prototype.openRequest = RSXHR3.prototype.open;
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
  console.log('\n[Step] 触发 trampoline (with enhanced XHR)...');
  var xhr3 = new RSXHR3();
  // 用完整的 open 调用（带 user/password 默认值）
  xhr3.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true, '', '');
  for (var k in xhr3) { if (k.startsWith('_$') && typeof xhr3[k] === 'boolean') xhr3[k] = true; }
  var tramp3 = null;
  for (var k in xhr3) { if (k.startsWith('_$') && typeof xhr3[k] === 'function') { tramp3 = xhr3[k]; break; } }

  if (tramp3) {
    var result3 = '';
    try { result3 = tramp3.call(xhr3, '{}') || ''; } catch(e) { console.log('Threw:', e.message); }
    console.log('Result: "' + String(result3).substring(0, 80) + '" (length:', result3.length, ')');
    
    var catches3 = vm.runInContext('window.__ce || []', env3.proxied);
    console.log('Catches:', catches3.length);
    var seen3 = new Set();
    catches3.forEach(function(c) {
      if (seen3.has(c.msg)) return;
      seen3.add(c.msg);
      console.log('  -', c.msg.substring(0, 100));
    });
    
    if (result3 && result3.length > 10) {
      console.log('\n*** QUERY CAPTURED! ***');
      console.log('Query:', result3);
    }
  } else {
    console.log('No trampoline found');
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
