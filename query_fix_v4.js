/**
 * query_fix_v4.js — 深入分析 charAt 异常的根因
 *
 * 从 v3 分析：
 * charAt 异常在函数 _$lH 中：
 * _$d7[56][_$lM[52]](_$gX[_$gu],0) !== _$fD
 * → _$d7[56] 是 String.prototype（或某个字符串方法集）
 * → _$lM[52] 是方法名（可能是 'indexOf' 或 'charAt'）
 * → _$gX[_$gu] 是被操作的值（null/undefined）
 * → _$gX 是 open() 参数解析后的对象
 * → _$gu 是某个属性索引
 *
 * 关键：_$gX[_$gu] 是 null/undefined
 * 这意味着 open() 参数对象上某个属性是 null/undefined
 *
 * RS 的 open() hook 解析参数：
 * _$gX._$eo = URL 相关
 * _$gX._$i7 = 另一个 URL 相关
 * _$gX._$ih = _$gX[_$lM[86]] — 某个属性
 * _$gX._$fy = _$gX[_$iH[71]] — 某个属性
 * _$gX._$bS = _$d7[26][_$lM[52]](_$g2._$ak, ...) — 某个方法调用
 *
 * _$gX[_$gu] 可能是 open() 的某个参数（method/url/async/user/password）
 * 当 _$gu 对应的索引指向 user/password 时，值为 undefined
 *
 * 方法：在 _$lH 函数中插入变量导出
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 深入 charAt 根因 + 变量导出 v4 ===\n');

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

  // Step 1: 执行获取异常 → 提取函数名
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched1 = dynCode;
  var match;
  var offset1 = 0;
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset1;
    var insert = 'if(!window.__ce)window.__ce=[];try{window.__ce.push({msg:String(' + errVar + '&&' + errVar + '.message||' + errVar + ').substring(0,150),stack:String(' + errVar + '&&' + errVar + '.stack||"").substring(0,600)});}catch(_$ignore){}';
    patched1 = patched1.substring(0, insertPos) + insert + patched1.substring(insertPos);
    offset1 += insert.length;
  }

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
  let done1 = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done1) { done1 = true; return origEval2.call(this, patched1); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  vm.runInContext('window.__ce = []', env2.proxied);

  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }
  if (tramp) { try { tramp.call(xhr, '{}'); } catch(e) {} }

  var catches = vm.runInContext('window.__ce || []', env2.proxied);
  // 提取第一个异常的函数名
  var charAtError = catches.find(function(c) { return c.msg.indexOf('charAt') >= 0; });
  if (!charAtError) { console.log('No charAt error found'); process.exit(0); }
  
  // 从 stack 提取第一个出错的函数名
  var firstFrameMatch = charAtError.stack.match(/at\s+(\S+)\s+\(dyn\.js:/);
  var errorFuncName = firstFrameMatch ? firstFrameMatch[1] : null;
  console.log('charAt error function:', errorFuncName);

  // 提取所有帧的函数名
  var allFrames = [...charAtError.stack.matchAll(/at\s+(\S+)\s+\(dyn\.js:/g)].map(m => m[1]);
  console.log('Call chain:', allFrames.join(' → '));

  // Step 2: 在 patched1 代码中找到 errorFuncName 函数定义
  // 提取行号列号
  var posMatch = charAtError.stack.match(/at\s+\S+\s+\(dyn\.js:(\d+):(\d+)\)/);
  var errLine = parseInt(posMatch[1]);
  var errCol = parseInt(posMatch[2]);
  console.log('Error at line', errLine, 'col', errCol);

  // 在 patched1 中定位
  var pLineStarts = [0];
  for (var pi = 0; pi < patched1.length; pi++) {
    if (patched1[pi] === '\n') pLineStarts.push(pi + 1);
  }
  if (errLine <= pLineStarts.length) {
    var lStart = pLineStarts[errLine - 1];
    var lEnd = errLine < pLineStarts.length ? pLineStarts[errLine] - 1 : patched1.length;
    var lContent = patched1.substring(lStart, lEnd);
    var col0 = errCol - 1;
    
    // 找到 errorFuncName 函数定义
    var funcDefPattern = new RegExp('function\\s+' + errorFuncName.replace(/\$/g, '\\$') + '\\s*\\(', 'g');
    var funcDefMatch = funcDefPattern.exec(lContent);
    if (funcDefMatch) {
      var funcDefStart = funcDefMatch.index;
      var funcBrace = lContent.indexOf('{', funcDefStart);
      var funcDepth = 0;
      var funcEnd = funcBrace;
      for (var fi = funcBrace; fi < lContent.length; fi++) {
        if (lContent[fi] === '{') funcDepth++;
        else if (lContent[fi] === '}') { funcDepth--; if (funcDepth === 0) { funcEnd = fi; break; } }
      }
      var funcBody = lContent.substring(funcDefStart, funcEnd + 1);
      console.log('\n' + errorFuncName + ' function:');
      console.log('  Col:', funcDefStart, 'Length:', funcBody.length);
      console.log('  Body:');
      console.log(funcBody);
      
      // 在函数体中找到出错位置
      var errRelCol = col0 - funcDefStart;
      console.log('\n  Error at relative col', errRelCol, 'in function');
      if (errRelCol > 0 && errRelCol < funcBody.length) {
        console.log('  Context:');
        console.log('    ' + funcBody.substring(Math.max(0, errRelCol - 100), errRelCol));
        console.log('    <<ERROR>>' + funcBody.substring(errRelCol, Math.min(funcBody.length, errRelCol + 100)));
      }
      
      // Step 3: 在函数体开头插入变量导出
      // 找到函数参数列表
      var paramMatch = funcBody.match(/function\s+\S+\s*\(([^)]*)\)/);
      var params = paramMatch ? paramMatch[1].split(',').map(function(s) { return s.trim(); }) : [];
      console.log('\n  Parameters:', params);
      
      // 在函数体开头插入导出代码
      var bodyStart = funcBody.indexOf('{') + 1;
      var exportCode = 'if(!window.__' + errorFuncName + '_data)window.__' + errorFuncName + '_data=[];try{window.__' + errorFuncName + '_data.push({';
      params.forEach(function(p, i) {
        if (p && p !== 'undefined') {
          exportCode += p + '_type:typeof ' + p + ',' + p + '_val:String(' + p + ').substring(0,100),';
        }
      });
      exportCode += 'stack:(new Error()).stack.split("\\n").slice(1,4).join(" | ")});}catch(_$ignore){}';
      
      // 在 patched1 中插入
      var absInsertPos = lStart + funcDefStart + bodyStart;
      var patched2 = patched1.substring(0, absInsertPos) + exportCode + patched1.substring(absInsertPos);
      
      // Step 4: 执行 patched2
      console.log('\n\n=== 执行带变量导出的代码 ===');
      
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
        if (typeof code === 'string' && code.length > 50000 && !done3) { done3 = true; return origEval3.call(this, patched2); }
        return origEval3.call(this, code);
      };
      try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env3.proxied, { timeout: 30000 }); } catch(e) {}
      await new Promise(r => setTimeout(r, 2000));
      
      vm.runInContext('window.__ce = []; window.__' + errorFuncName + '_data = []', env3.proxied);
      
      // 触发
      var xhr3 = new RSXHR3();
      RSXHR3.prototype.open.call(xhr3, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      for (var k in xhr3) { if (k.startsWith('_$') && typeof xhr3[k] === 'boolean') xhr3[k] = true; }
      var tramp3 = null;
      for (var k in xhr3) { if (k.startsWith('_$') && typeof xhr3[k] === 'function') { tramp3 = xhr3[k]; break; } }
      if (tramp3) { try { tramp3.call(xhr3, '{}'); } catch(e) {} }
      
      // 检查导出的变量
      var exportKey = '__' + errorFuncName + '_data';
      var exportedData = vm.runInContext('window.' + exportKey + ' || []', env3.proxied);
      console.log('\n=== ' + errorFuncName + ' calls:', exportedData.length, '===');
      exportedData.forEach(function(d, i) {
        console.log('\n  [Call ' + i + ']');
        Object.keys(d).forEach(function(key) {
          console.log('    ' + key + ':', d[key]);
        });
      });
      
      // 也检查 catches
      var catches3 = vm.runInContext('window.__ce || []', env3.proxied);
      console.log('\nCatches:', catches3.length);
      var seen = new Set();
      catches3.forEach(function(c) {
        if (seen.has(c.msg)) return;
        seen.add(c.msg);
        console.log('  -', c.msg.substring(0, 80));
      });
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
