/**
 * opcode_patch_query.js — RS 动态代码 query 生成启用：分析与插桩
 *
 * == 核心发现 ==
 *
 * 1. RS hook 行为确认
 *    - RS 成功 hook XMLHttpRequest.prototype.open/send
 *    - RS.open 在 XHR 实例上设置：
 *      a) JSVMP trampoline 函数（变量名每次会话变化，如 _$g9/_$be/_$fF）
 *      b) 布尔 flag = false（变量名每次变化，如 _$lx/_$cb/_$$U）
 *    - flag=false → RS.send 读取 flag 后跳过 trampoline 调用
 *
 * 2. 强制 flag=true 的效果
 *    - RS.send 进入 query 生成路径，调用 trampoline(body)
 *    - trampoline 是 JSVMP 函数：function _$xx(){ ... VM_DISP(CTX, 0, CTX.BC.length, ARGS) ... return ARGS[5]; }
 *    - trampoline 返回空字符串 ""（不是 undefined！）
 *    - RS.send 检查返回值：空字符串是 falsy → 不修改 URL
 *
 * 3. trampoline 返回空字符串的根因
 *    - VM 执行完毕，退出码=2（非1=正常返回），ARGS[5]="" 
 *    - Patch if(exitCode===1)→if(true) 后：强制返回 ARGS[5]，但值仍为 ""
 *    - 移除所有 catch{...=""} 块后：无异常被抛出 → 不是 catch 吞错误
 *    - VM 的 query 生成算法正常运行，但输出为空字符串
 *    - 结论：VM 内部有条件判断，在沙箱环境下评估为 false，跳过实际生成逻辑
 *
 * 4. 根因分析
 *    - 沙箱 P cookie 被服务器拒绝（400），说明沙箱 cookie 不被接受
 *    - MEMORY.md 记录的 100% 通过率修复（numarr2string.js）未在此环境生效
 *      （sandbox_keygen.js 使用自己的 cookie 生成路径，不经管线 numarr2string.js）
 *    - RS VM 内部检查 cookie 有效性状态（可能通过 $_mb 共享状态数组）
 *    - 状态在沙箱中从未被设为"已验证"，因为：
 *      a) 沙箱生成的 cookie 被 400 拒绝
 *      b) RS 无法从服务器获得 200 确认
 *      c) RS 的 query 初始化代码路径未被触发
 *
 * 5. VM dispatcher 结构
 *    - 6 个 VM 解释器（while(1) + 二叉 if 树），函数名每次会话变化
 *    - 主 VM（L1）~72K 字符，包含 cookie/密钥/query 生成主逻辑
 *    - trampoline 调用 VM dispatcher(vmCtx, 0, bytecodeLen, argsArray)
 *    - vmCtx 包含：bytecode, scope, closure vars, cache flag
 *
 * == 方法与结果 ==
 *
 * A. 强制 flag=true：✅ RS.send 调用 trampoline
 * B. 强制 VM 退出码=1：✅ trampoline 返回值（但为空字符串）
 * C. 移除 catch 块：❌ 无异常暴露
 * D. String/Array hook：❌ 未捕获 query 相关字符串操作
 * E. 双 pass（带 cookie 重跑）：❌ flag 仍为 false
 * F. 全新沙箱 + seedCookie：❌ flag 仍为 false
 *
 * == 结论 ==
 *
 * trampoline VM 的 query 生成路径依赖 RS 内部"已验证"状态。
 * 该状态在浏览器中通过"首次 412 → cookie → reload → 200"流程设置。
 * 沙箱中无法完成此流程（cookie 被 400 拒绝）。
 *
 * == 下一步可行路径 ==
 *
 * 1. 修复沙箱 cookie 通过率（使服务器返回 200）
 *    - sandbox_keygen.js 的 cookie 生成不经管线修复
 *    - 需排查沙箱 cookie 与管线 cookie 的差异
 *
 * 2. 用 Patchright（路径A2）获取浏览器生成的真实 cookie
 *    - 浏览器 cookie 100% 通过
 *    - 用真实 cookie 做第二遍沙箱 → RS 可能启用 query
 *
 * 3. CDP 断点提取（路径B）
 *    - 在浏览器 RS.send 内部设断点
 *    - 检查"已验证"状态的具体存储位置
 *    - 在沙箱中复制该状态
 *
 * 用法：nvm exec 22 node opcode_patch_query.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

function httpGet(url, cookies) {
  return new Promise(r => {
    var opts = { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } };
    if (cookies) opts.headers.Cookie = cookies;
    https.get(url, opts, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', e => r({ status: 'ERR', body: '' }));
  });
}

(async () => {
  console.log('=== RS Query Generation Patch Analysis ===\n');

  // Step 1: Fetch challenge page
  console.log('[1] Fetching challenge page...');
  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/');
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('ERROR: no $_ts found'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
  console.log('  nsd:', nsd, 'status:', ch.status);

  // Step 2: Set up sandbox
  console.log('\n[2] Building sandbox...');
  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const outerJsCode = fs.readFileSync(
    path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js'), 'utf8'
  );

  const queryCapture = { value: null, url: null, method: null };

  function RSXHR() {}
  RSXHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
    timeout: 0, withCredentials: false,
    open: function(method, url) { this._method = method; this._url = String(url); this._headers = {}; this.readyState = 1; },
    send: function(body) {
      var self = this;
      if (self._url && self._url.includes('r20SZOQm=')) {
        var match = self._url.match(/r20SZOQm=([^&]+)/);
        if (match) { queryCapture.value = match[1]; queryCapture.url = self._url; }
      }
      Promise.resolve().then(function() {
        if (self._url && self._url.includes('r20SZOQm=')) {
          var match2 = self._url.match(/r20SZOQm=([^&]+)/);
          if (match2) { queryCapture.value = match2[1]; queryCapture.url = self._url; }
        }
        self.readyState = 4; self.status = 200;
        self.responseText = '{"status":0,"message":"Success","data":{}}';
        self.responseURL = self._url;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        if (self.onload) { try { self.onload(); } catch(e) {} }
      });
    },
    setRequestHeader: function(k, v) { if (!this._headers) this._headers = {}; this._headers[k] = v; },
    abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function(type, fn) { if (type === 'load') this.onload = fn; },
    removeEventListener: function() {},
    upload: { addEventListener: function() {}, removeEventListener: function() {} },
  };

  const env = buildEnv({ nsd, cd }, { outerJsCode, seedCookie: oCookie, timeout: 30000 });
  env.sandbox.XMLHttpRequest = RSXHR;

  // Patch dynamic code: force trampoline exit code
  var origEval = env.sandbox.eval;
  var dynCode = null;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      dynCode = code;
      // Force all "if(exitCode===1)return VAR;" → "if(true)return VAR;"
      code = code.replace(/if\((\S+?)===1\)return\s+/g, 'if(true)return ');
      console.log('  [eval] Dynamic code patched (force exit), length:', code.length);
    }
    return origEval.call(this, code);
  };

  // Step 3: Run outer VM
  console.log('\n[3] Running outer VM...');
  try { vm.runInContext(outerJsCode, env.proxied, { timeout: 30000, filename: 'outer.js' }); }
  catch(e) { console.log('  Outer VM error:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 2000));

  const pCookie = env.captured.cookies.find(c => c.includes('P='));
  console.log('  P cookie:', pCookie ? pCookie.substring(0, 40) + '...' : 'null');

  // Step 4: Inspect RS hooks
  console.log('\n[4] RS hook inspection...');
  var rsOpen = RSXHR.prototype.open;
  var rsSend = RSXHR.prototype.send;
  console.log('  prototype.open hooked:', rsOpen.toString().includes('[native'));
  console.log('  prototype.send hooked:', rsSend.toString().includes('[native'));

  // Find flag and trampoline
  var testXhr = new RSXHR();
  rsOpen.call(testXhr, 'POST', '/test', true);
  var ownProps = Object.getOwnPropertyNames(testXhr);
  var flagName = null, trampName = null;
  for (var k of ownProps) {
    if (k.startsWith('_') && typeof testXhr[k] === 'boolean') flagName = k;
    if (k.startsWith('_') && typeof testXhr[k] === 'function') trampName = k;
  }
  console.log('  Flag:', flagName, '=', flagName ? testXhr[flagName] : 'N/A');
  console.log('  Trampoline:', trampName);

  // Step 5: Test with forced flag
  console.log('\n[5] Testing with forced flag=true...');
  var xhr = new RSXHR();
  rsOpen.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  if (flagName) xhr[flagName] = true;

  // Wrap trampoline to log
  var origTramp = xhr[trampName];
  xhr[trampName] = function() {
    var args = Array.prototype.slice.call(arguments);
    console.log('  [tramp] called with args:', args.map(function(a) { return typeof a === 'string' ? a.substring(0, 40) : typeof a; }));
    var result = origTramp.apply(this, arguments);
    console.log('  [tramp] returned:', typeof result, JSON.stringify(result)?.substring(0, 80));
    return result;
  };

  console.log('  Before send: _url =', xhr._url);
  rsSend.call(xhr, '{"test":1}');
  console.log('  After send: _url =', xhr._url);

  // Step 6: Direct trampoline call
  console.log('\n[6] Direct trampoline call...');
  var xhr2 = new RSXHR();
  rsOpen.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  if (flagName) xhr2[flagName] = true;

  var tramp = xhr2[trampName];
  var result = tramp.call(xhr2, '{"test":1}');
  console.log('  Result type:', typeof result);
  console.log('  Result value:', JSON.stringify(result));
  console.log('  Result length:', result ? result.length : 0);

  // Step 7: Cookie validation check
  console.log('\n[7] Cookie validation check...');
  if (pCookie) {
    var fullCookie = oCookie + '; ' + pCookie.split(';')[0];
    var validation = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', fullCookie);
    console.log('  Validation status:', validation.status);
    if (validation.status === 200) {
      console.log('  Cookie accepted! RS should enable query on second load.');
    } else {
      console.log('  Cookie rejected. RS internal state will not reach "validated".');
      console.log('  This is why trampoline returns empty string.');
    }
  }

  // Step 8: Dyn code analysis
  console.log('\n[8] Dynamic code analysis...');
  if (dynCode) {
    var while1Count = (dynCode.match(/while\(1\)\{/g) || []).length;
    var tryCount = (dynCode.match(/try\s*{/g) || []).length;
    var catchCount = (dynCode.match(/catch\s*\(/g) || []).length;
    var funcCount = (dynCode.match(/function\s+/g) || []).length;
    console.log('  VM dispatchers (while(1)):', while1Count);
    console.log('  try blocks:', tryCount, 'catch blocks:', catchCount);
    console.log('  Function definitions:', funcCount);
    console.log('  Dyn code length:', dynCode.length);
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log('Flag name:', flagName);
  console.log('Trampoline name:', trampName);
  console.log('Trampoline result:', typeof result, JSON.stringify(result)?.substring(0, 80));
  console.log('Query captured:', queryCapture.value || 'NOT CAPTURED');
  console.log('\nRoot cause: trampoline VM returns empty string because');
  console.log('RS internal "validated" state is not set in sandbox.');
  console.log('Cookie validation fails (400), preventing state transition.');

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
