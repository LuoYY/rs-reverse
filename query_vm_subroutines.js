/**
 * query_vm_subroutines.js — 提取 VM 子程序 _$dA 的实现
 *
 * _$dA 是 VM 子程序调用函数
 * 调用模式：
 *   _$dA(109, key, data, output) → 加密
 *   _$dA(145, data) → 处理
 *   _$dA(62) → 某种操作
 *
 * 目标：
 * 1. 在动态代码中找到 _$dA 的定义
 * 2. 理解它如何调用子程序
 * 3. 找到子程序 109 的实现
 * 4. 确认是否是 encryptMode1
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

function makeAnchorEl() {
  var el = { tagName: 'A', nodeType: 1, style: new Proxy({}, { get: () => '', set: () => true }), children: [], childNodes: [],
    setAttribute: function(name, val) { if (name === 'href') this.href = String(val); },
    getAttribute: function(name) { if (name === 'href') return this._href || ''; return null; },
    removeAttribute() {}, appendChild(c) { return c; }, removeChild(c) { return c; },
    addEventListener() {}, removeEventListener() {}, _href: '', _url: null };
  Object.defineProperty(el, 'href', { get: function() { return this._href; }, set: function(v) { this._href = String(v);
    try { var b = 'https://pmos.xj.sgcc.com.cn:20080'; try { this._url = new URL(this._href, b); } catch(e) { this._url = { href: this._href, protocol: '', host: '', hostname: '', port: '', pathname: this._href, search: '', hash: '', origin: b }; } } catch(e) { this._url = null; } }, configurable: true });
  ['protocol','host','hostname','port','pathname','search','hash','origin'].forEach(function(p) {
    Object.defineProperty(el, p, { get: function() { return this._url ? (this._url[p] || '') : ''; }, set: function(){}, configurable: true }); });
  el.innerHTML=''; el.innerText=''; el.textContent=''; el.className=''; el.id=''; el.clientWidth=0; el.clientHeight=0;
  el.getBoundingClientRect=function(){return{top:0,left:0,right:0,bottom:0,width:0,height:0};}; el.getElementsByTagName=function(){return[];}; el.querySelector=function(){return null;}; el.querySelectorAll=function(){return[];};
  el.cloneNode=function(){return makeAnchorEl();}; el.remove=function(){}; el.parentNode=null; el.parentElement=null; el.firstChild=null; el.lastChild=null; el.nextSibling=null;
  return el;
}

(async () => {
  console.log('=== 提取 VM 子程序 _$dA 实现 ===\n');

  // 获取动态代码
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

  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  function RSXHR() {}
  RSXHR.prototype = { open: function(m,u) { this._url=String(u); this.readyState=1; }, send: function() { this.readyState=4; this.status=200; this.responseText='{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {}, getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {}, readyState:0, status:0, responseText:'', responseURL:'' };
  env1.sandbox.XMLHttpRequest = RSXHR;
  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  env1.sandbox.document.createElement = function(tag) { if (String(tag).toLowerCase() === 'a') return makeAnchorEl(); return env1.sandbox.document.createElement.call(this, tag); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  if (!dynCode) { console.log('FATAL: dynCode not captured'); process.exit(1); }
  console.log('Dynamic code:', dynCode.length, 'bytes');

  // 获取操作码表中的变量名
  const opcodeData = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/capture-20080/opcode-table-v2.json'), 'utf8'));
  
  // 从操作码中提取 _$dA 的变量名
  // 但变量名每次会话变化！
  // 需要从当前会话的动态代码中提取

  // 方法：在动态代码中搜索 VM 子程序调用函数
  // 它的特征是：接受子程序编号作为第一个参数
  // 然后调用 dispatcher 执行该子程序

  console.log('\n[2] 搜索 VM 子程序调用函数...');

  // 从操作码表中获取当前会话的 _$dA 变量名
  // op12: _$lV=_$dA(109,_$j3[72],_$c5,_$lV)
  // 但操作码表中的变量名可能来自不同会话

  // 在当前动态代码中搜索特征
  // 子程序调用函数的特征：
  // 1. 接受数字作为第一个参数
  // 2. 内部调用 dispatcher
  // 3. 返回结果

  // 更直接的方法：在动态代码中搜索包含数字 109 或 145 的函数调用
  // 但这些数字可能被混淆

  // 最有效的方法：从 send hook 的源码中提取变量名
  // 然后在动态代码中搜索这些变量

  // 获取 send hook 源码
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  env2.sandbox.document.createElement = function(tag) { if (String(tag).toLowerCase() === 'a') return makeAnchorEl(); return env2.sandbox.document.createElement.call(this, tag); };
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  RSXHR2.prototype.open = function(method, url) { this._url = String(url); this.readyState = 1; };
  env2.sandbox.XMLHttpRequest = RSXHR2;

  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, code); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 获取 send hook 源码（直接从 prototype）
  var sendSrc = vm.runInContext('Function.prototype.toString.call(XMLHttpRequest.prototype.send)', env2.proxied);
  if (!sendSrc || sendSrc.indexOf('native code') >= 0) {
    console.log('  send is native, trying open...');
    sendSrc = vm.runInContext('Function.prototype.toString.call(XMLHttpRequest.prototype.open)', env2.proxied);
  }
  
  console.log('  send/open source:', sendSrc ? sendSrc.substring(0, 100) : 'none');
  
  if (!sendSrc || sendSrc.indexOf('function') !== 0) {
    console.log('  Cannot get send hook source');
    // 直接在动态代码中搜索 dispatcher
  } else {
    // 从 send hook 提取 dispatcher 和 config 变量名
    var dispMatch = sendSrc.match(/([_$$a-zA-Z0-9]+)\(([_$$a-zA-Z0-9]+),\s*0,\s*([_$$a-zA-Z0-9]+)\.([_$$a-zA-Z0-9]+)\.length/);
    if (!dispMatch) {
      console.log('  Cannot extract dispatcher name');
    }
  }
  
  if (!dispMatch) {
    // 直接在动态代码中搜索最大的 switch-case（子程序分发器）
    console.log('\n[3b] 搜索子程序分发器...');
    
    var bigSwitchPattern = /switch\s*\(/g;
    var switchMatch;
    var bestSwitch = null;
    
    while ((switchMatch = bigSwitchPattern.exec(dynCode)) !== null) {
      var pos = switchMatch.index;
      var chunk = dynCode.substring(pos, Math.min(dynCode.length, pos + 20000));
      var cases = (chunk.match(/case\s+\d+\s*:/g) || []).length;
      if (cases > 30) {
        console.log('  Large switch at pos', pos, 'with', cases, 'cases');
        if (!bestSwitch || cases > bestSwitch.cases) {
          bestSwitch = { pos: pos, cases: cases };
        }
      }
    }
    
    if (bestSwitch) {
      console.log('\n  Best switch:', bestSwitch.cases, 'cases at pos', bestSwitch.pos);
      
      // 提取 switch 代码
      var switchCode = dynCode.substring(bestSwitch.pos, Math.min(dynCode.length, bestSwitch.pos + 30000));
      
      // 搜索 case 109
      var case109Pos = switchCode.indexOf('case 109:');
      if (case109Pos >= 0) {
        var case109End = switchCode.indexOf('case ', case109Pos + 10);
        if (case109End < 0) case109End = case109Pos + 1000;
        var case109Code = switchCode.substring(case109Pos, case109End);
        console.log('\n  ★ Case 109 (加密子程序):');
        console.log('  ' + case109Code.substring(0, 800));
      }
      
      // 搜索 case 145
      var case145Pos = switchCode.indexOf('case 145:');
      if (case145Pos >= 0) {
        var case145End = switchCode.indexOf('case ', case145Pos + 10);
        if (case145End < 0) case145End = case145Pos + 500;
        var case145Code = switchCode.substring(case145Pos, case145End);
        console.log('\n  ★ Case 145 (nonce处理):');
        console.log('  ' + case145Code.substring(0, 500));
      }
      
      // 搜索 case 193
      var case193Pos = switchCode.indexOf('case 193:');
      if (case193Pos >= 0) {
        var case193End = switchCode.indexOf('case ', case193Pos + 10);
        if (case193End < 0) case193End = case193Pos + 500;
        var case193Code = switchCode.substring(case193Pos, case193End);
        console.log('\n  ★ Case 193 (URL变换):');
        console.log('  ' + case193Code.substring(0, 500));
      }
      
      // 搜索 case 62
      var case62Pos = switchCode.indexOf('case 62:');
      if (case62Pos >= 0) {
        var case62End = switchCode.indexOf('case ', case62Pos + 10);
        if (case62End < 0) case62End = case62Pos + 500;
        var case62Code = switchCode.substring(case62Pos, case62End);
        console.log('\n  ★ Case 62:');
        console.log('  ' + case62Code.substring(0, 300));
      }
      
      // 列出所有 case 编号
      var caseNumPattern = /case\s+(\d+)\s*:/g;
      var caseNumMatch;
      var caseNums = [];
      while ((caseNumMatch = caseNumPattern.exec(switchCode)) !== null) {
        caseNums.push(parseInt(caseNumMatch[1]));
      }
      console.log('\n  All case numbers:', caseNums.slice(0, 50).join(', '));
      console.log('  Total:', caseNums.length);
      
      // 保存 switch 代码
      fs.writeFileSync(
        path.join(ROOT, 'output/capture-20080/vm-subroutine-dispatcher.js'),
        switchCode.substring(0, 30000)
      );
      console.log('\n  Saved to output/capture-20080/vm-subroutine-dispatcher.js');
    }
    
    process.exit(0);
  }
  
  var dispatcherName = dispMatch[1];
  var configName = dispMatch[2];
  var bytecodeProp = dispMatch[4];
  console.log('  dispatcher:', dispatcherName);
  console.log('  config:', configName);
  console.log('  bytecode:', bytecodeProp);

  // 在动态代码中搜索 dispatcher 函数定义
  var escapedDisp = dispatcherName.replace(/\$/g, '\\$');
  var dispDefPattern = new RegExp('function\\s+' + escapedDisp + '\\s*\\(', 'g');
  var dispDefMatch = dispDefPattern.exec(dynCode);
  
  if (dispDefMatch) {
    var dispPos = dispDefMatch.index;
    console.log('\n[3] Dispatcher 定义位置:', dispPos);
    
    // 提取 dispatcher 函数体
    var bracePos = dynCode.indexOf('{', dispPos);
    var depth = 0;
    var dispEnd = bracePos;
    for (var i = bracePos; i < dynCode.length; i++) {
      if (dynCode[i] === '{') depth++;
      else if (dynCode[i] === '}') { depth--; if (depth === 0) { dispEnd = i; break; } }
    }
    var dispCode = dynCode.substring(dispPos, dispEnd + 1);
    console.log('  Dispatcher code length:', dispCode.length);
    
    // 在 dispatcher 中搜索子程序调用
    // 子程序调用的特征：调用另一个函数，传入子程序编号
    // 或者：dispatcher 内部有 switch/case 来处理不同子程序

    // 搜索 dispatcher 中的函数调用
    console.log('\n[4] 在 dispatcher 中搜索子程序调用...');
    
    // 搜索所有函数定义
    var funcDefs = [];
    var funcPattern = /function\s+([_$$a-zA-Z0-9]+)\s*\(/g;
    var funcMatch;
    while ((funcMatch = funcPattern.exec(dispCode)) !== null) {
      funcDefs.push({ name: funcMatch[1], pos: funcMatch.index });
    }
    console.log('  函数定义:', funcDefs.length);
    funcDefs.slice(0, 10).forEach(function(f) {
      console.log('    ' + f.name + ' at pos ' + f.pos);
    });
    
    // 搜索 dispatcher 中调用的外部函数
    // 这些函数可能是子程序
    var extCalls = new Set();
    var callPattern = /([_$$a-zA-Z0-9]+)\s*\(/g;
    var callMatch;
    while ((callMatch = callPattern.exec(dispCode)) !== null) {
      var fn = callMatch[1];
      if (fn !== 'function' && fn !== 'if' && fn !== 'for' && fn !== 'while' && fn !== 'switch' && fn !== 'case' && fn !== 'return' && fn !== 'typeof' && fn !== 'new' && fn !== 'try' && fn !== 'catch') {
        extCalls.add(fn);
      }
    }
    console.log('\n  外部函数调用:', extCalls.size);
    
    // 搜索关键函数：加密相关的
    var cryptoFuncs = [...extCalls].filter(function(f) {
      return f.startsWith('_$') || f.startsWith('_$$');
    });
    console.log('  RS 函数:', cryptoFuncs.length);
    cryptoFuncs.slice(0, 30).forEach(function(f) {
      console.log('    ' + f);
    });
    
    // 保存 dispatcher 代码
    fs.writeFileSync(
      path.join(ROOT, 'output/capture-20080/dispatcher-code.js'),
      dispCode
    );
    console.log('\n  Dispatcher code saved to output/capture-20080/dispatcher-code.js');
    
    // 在 dispatcher 中搜索 case 109 或 === 109
    console.log('\n[5] 搜索子程序 109...');
    var pos109 = dispCode.indexOf('109');
    if (pos109 >= 0) {
      console.log('  Found 109 at pos', pos109);
      console.log('  Context:', dispCode.substring(Math.max(0, pos109 - 50), pos109 + 100));
    }
    
    var pos145 = dispCode.indexOf('145');
    if (pos145 >= 0) {
      console.log('  Found 145 at pos', pos145);
      console.log('  Context:', dispCode.substring(Math.max(0, pos145 - 50), pos145 + 100));
    }
    
    // 搜索 case 语句
    var caseCount = (dispCode.match(/case\s+/g) || []).length;
    console.log('\n  case 语句数量:', caseCount);
    
    // 搜索 === 比较
    var eqCount = (dispCode.match(/===/g) || []).length;
    console.log('  === 比较数量:', eqCount);
    
    // 如果 dispatcher 是一个大的 switch-case
    // 子程序 109 应该有一个对应的 case
    if (caseCount > 10) {
      console.log('\n  Dispatcher 使用 switch-case 分发');
      // 提取所有 case
      var casePattern = /case\s+(\d+)\s*:/g;
      var caseMatch2;
      var cases = [];
      while ((caseMatch2 = casePattern.exec(dispCode)) !== null) {
        cases.push(parseInt(caseMatch2[1]));
      }
      console.log('  Cases:', cases.slice(0, 30).join(', '));
      console.log('  Total cases:', cases.length);
      
      // 检查 109 和 145 是否在 cases 中
      if (cases.indexOf(109) >= 0) {
        console.log('\n  ★ Case 109 found!');
        // 提取 case 109 的处理代码
        var case109Start = dispCode.indexOf('case 109:');
        var case109End = dispCode.indexOf('case', case109Start + 10);
        if (case109End < 0) case109End = dispCode.indexOf('default', case109Start);
        if (case109End < 0) case109End = case109Start + 500;
        var case109Code = dispCode.substring(case109Start, case109End);
        console.log('  Case 109 code:');
        console.log('  ' + case109Code.substring(0, 500));
      }
      
      if (cases.indexOf(145) >= 0) {
        console.log('\n  ★ Case 145 found!');
        var case145Start = dispCode.indexOf('case 145:');
        var case145End = dispCode.indexOf('case', case145Start + 10);
        if (case145End < 0) case145End = case145Start + 500;
        var case145Code = dispCode.substring(case145Start, case145End);
        console.log('  Case 145 code:');
        console.log('  ' + case145Code.substring(0, 500));
      }
    }
  } else {
    console.log('  Dispatcher not found by name');
    
    // 备选方法：在动态代码中搜索包含大量 case 的函数
    console.log('\n[3b] 搜索大 switch-case 函数...');
    var bigSwitch = /switch\s*\([^)]+\)\s*\{/g;
    var switchMatch;
    while ((switchMatch = bigSwitch.exec(dynCode)) !== null) {
      var pos = switchMatch.index;
      var chunk = dynCode.substring(pos, Math.min(dynCode.length, pos + 10000));
      var cases = (chunk.match(/case\s+\d+/g) || []).length;
      if (cases > 20) {
        console.log('  Large switch at pos', pos, 'with', cases, 'cases');
      }
    }
  }

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
