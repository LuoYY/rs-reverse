/**
 * query_decompile_v2.js — 完整反编译 VM bytecode
 *
 * 策略改进：
 * 1. 在同一会话中获取动态代码
 * 2. 从动态代码中提取完整的 VM dispatcher（操作码处理函数）
 * 3. 用提取的操作码表反编译 bytecode
 * 4. 生成可读的伪代码
 *
 * 关键：操作码值在不同会话间变化
 * 所以必须在同一会话中完成：获取代码 → 提取操作码 → 反编译
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
  console.log('=== 完整反编译 VM bytecode ===\n');

  // Step 1: 获取动态代码
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

  // Step 2: 提取 VM dispatcher 的操作码处理函数
  // VM dispatcher 是一个大的 while 循环 + if/else 分发
  // 格式: while(cond){ ... if(_$aK===N){ ... } else if(_$aK===M){ ... } ... }
  // 或: while(cond){ switch(_$aK){ case N: ...; case M: ...; } }

  console.log('\n[2] 提取 VM dispatcher...');

  // 找到 dispatcher 函数（最大的 while 循环）
  // 搜索 while(1) 或 while(_$xx) 后跟 if/switch
  var dispatcherPattern = /while\s*\(\s*(_\$[a-zA-Z0-9]+|true|1)\s*\)\s*\{/g;
  var match;
  var dispatchers = [];
  while ((match = dispatcherPattern.exec(dynCode)) !== null) {
    var pos = match.index;
    var ctx = dynCode.substring(pos, Math.min(dynCode.length, pos + 200));
    // 检查是否是 VM dispatcher（包含大量 if/switch）
    if (ctx.indexOf('switch') >= 0 || (ctx.indexOf('===') >= 0 && ctx.indexOf('_$eB') >= 0) || ctx.indexOf('_$eX') >= 0) {
      dispatchers.push({ pos: pos, context: ctx.substring(0, 150) });
    }
  }
  console.log('  Dispatchers found:', dispatchers.length);
  dispatchers.slice(0, 5).forEach(function(d, i) {
    console.log('  [' + i + '] pos', d.pos, ':', d.context.substring(0, 100));
  });

  // 找到包含最多 === 比较的 while 循环（最可能是 dispatcher）
  var bestDispatch = null;
  var maxComparisons = 0;
  
  dispatcherPattern.lastIndex = 0;
  while ((match = dispatcherPattern.exec(dynCode)) !== null) {
    var pos = match.index;
    var chunk = dynCode.substring(pos, Math.min(dynCode.length, pos + 5000));
    var comparisons = (chunk.match(/===/g) || []).length;
    if (comparisons > maxComparisons) {
      maxComparisons = comparisons;
      bestDispatch = { pos: pos, comparisons: comparisons };
    }
  }
  
  if (bestDispatch) {
    console.log('\n  Best dispatcher at pos', bestDispatch.pos, 'with', bestDispatch.comparisons, 'comparisons');
    
    // 提取 dispatcher 的完整代码
    var dispStart = bestDispatch.pos;
    // 找到 while 循环的结束位置
    var braceStart = dynCode.indexOf('{', dispStart);
    var depth = 0;
    var dispEnd = braceStart;
    for (var i = braceStart; i < dynCode.length; i++) {
      if (dynCode[i] === '{') depth++;
      else if (dynCode[i] === '}') { depth--; if (depth === 0) { dispEnd = i; break; } }
    }
    var dispCode = dynCode.substring(dispStart, dispEnd + 1);
    console.log('  Dispatcher code length:', dispCode.length);
    
    // 提取操作码 → 处理函数映射
    // 格式1: case N: ... break;
    // 格式2: if(_$aK===N){ ... }
    // 格式3: _$aK<=N?...:_$aK<=M?...:...
    
    var opcodeMap = {};
    
    // 方法1: 搜索 case N:
    var casePattern = /case\s+(\d+)\s*:/g;
    var caseMatch;
    while ((caseMatch = casePattern.exec(dispCode)) !== null) {
      var opcode = parseInt(caseMatch[1]);
      var handlerStart = caseMatch.index + caseMatch[0].length;
      // 找到下一个 case/break/default
      var nextCase = dispCode.indexOf('case ', handlerStart);
      var nextBreak = dispCode.indexOf('break', handlerStart);
      var nextDefault = dispCode.indexOf('default', handlerStart);
      var handlerEnd = Math.min(
        nextCase > 0 ? nextCase : dispCode.length,
        nextBreak > 0 ? nextBreak + 5 : dispCode.length,
        nextDefault > 0 ? nextDefault : dispCode.length
      );
      var handler = dispCode.substring(handlerStart, handlerEnd).trim();
      if (handler.length > 0) {
        opcodeMap[opcode] = handler.substring(0, 200);
      }
    }
    
    // 方法2: 搜索 ===N
    if (Object.keys(opcodeMap).length === 0) {
      var eqPattern = /===\s*(\d+)/g;
      var eqMatch;
      while ((eqMatch = eqPattern.exec(dispCode)) !== null) {
        var opcode2 = parseInt(eqMatch[1]);
        var handlerStart2 = eqMatch.index + eqMatch[0].length;
        // 找到下一个 === 或分号
        var nextEq = dispCode.indexOf('===', handlerStart2);
        var nextSemi = dispCode.indexOf(';', handlerStart2);
        var handlerEnd2 = Math.min(
          nextEq > 0 ? nextEq : dispCode.length,
          nextSemi > 0 ? nextSemi + 1 : dispCode.length
        );
        var handler2 = dispCode.substring(handlerStart2, handlerEnd2).trim();
        if (handler2.length > 0) {
          opcodeMap[opcode2] = handler2.substring(0, 200);
        }
      }
    }
    
    console.log('\n  操作码表:', Object.keys(opcodeMap).length, '个操作码');
    Object.keys(opcodeMap).sort((a, b) => a - b).forEach(function(op) {
      console.log('    op' + op + ': ' + opcodeMap[op].substring(0, 100));
    });
    
    // 保存操作码表
    fs.writeFileSync(
      path.join(ROOT, 'output/capture-20080/opcode-table-v2.json'),
      JSON.stringify({ opcodes: opcodeMap, dispatcherPos: bestDispatch.pos, timestamp: new Date().toISOString() }, null, 2)
    );
  }

  // Step 3: 获取 bytecode
  console.log('\n[3] 获取 bytecode...');
  
  // 执行动态代码并提取 VM context
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  env2.sandbox.document.createElement = function(tag) { if (String(tag).toLowerCase() === 'a') return makeAnchorEl(); return env2.sandbox.document.createElement.call(this, tag); };
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = {};
  RSXHR2.prototype.open = function(m,u) { this._url=String(u); this.readyState=1; };
  RSXHR2.prototype.send = function() { this.readyState=4; this.status=200; this.responseText='{}'; };
  RSXHR2.prototype.setRequestHeader = function() {};
  RSXHR2.prototype.abort = function() {};
  RSXHR2.prototype.getAllResponseHeaders = function() { return ''; };
  RSXHR2.prototype.getResponseHeader = function() { return null; };
  RSXHR2.prototype.addEventListener = function() {};
  RSXHR2.prototype.removeEventListener = function() {};
  RSXHR2.prototype.readyState = 0;
  RSXHR2.prototype.status = 0;
  RSXHR2.prototype.responseText = '';
  RSXHR2.prototype.responseURL = '';
  env2.sandbox.XMLHttpRequest = RSXHR2;

  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) {
      done = true;
      // 在动态代码末尾添加全局变量导出
      var patched = code + '\ntry{window.__dynCode=arguments;}catch(_$e){}';
      return origEval2.call(this, patched);
    }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 获取 trampoline 来提取 bytecode
  var xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/test', true);
  var trampName = null;
  for (var k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { trampName = k; break; } }
  
  if (trampName) {
    var trampStr = xhr[trampName].toString();
    console.log('  Trampoline:', trampName);
    
    // 从 trampoline 源码提取 bytecode 属性名
    var configMatch = trampStr.match(/if\s*\(\s*([_$$a-zA-Z0-9]+)\.([_$$a-zA-Z0-9]+)\s*\)/);
    var dispMatch = trampStr.match(/([_$$a-zA-Z0-9]+)\(([_$$a-zA-Z0-9]+),\s*0,\s*([_$$a-zA-Z0-9]+)\.([_$$a-zA-Z0-9]+)\.length/);
    
    if (configMatch && dispMatch) {
      var configObj = configMatch[1];
      var bytecodeProp = dispMatch[4];
      console.log('  Config:', configObj, 'Bytecode:', bytecodeProp);
      
      // 在动态代码中搜索 bytecode 赋值
      // config._$eW = [1, 0, 32, 68, ...]
      var bcPattern = new RegExp(configObj.replace(/\$/g, '\\$') + '\\.' + bytecodeProp.replace(/\$/g, '\\$') + '\\s*=\\s*\\[');
      var bcMatch = bcPattern.exec(dynCode);
      
      if (bcMatch) {
        var arrStart = bcMatch.index + bcMatch[0].length - 1; // 指向 [
        var arrEnd = dynCode.indexOf(']', arrStart);
        if (arrEnd > 0) {
          var arrStr = dynCode.substring(arrStart + 1, arrEnd);
          var bytecode = arrStr.split(',').map(function(s) { return parseInt(s.trim()); }).filter(function(n) { return !isNaN(n); });
          console.log('  Bytecode:', bytecode.length, 'elements');
          console.log('  ', bytecode.join(', '));
          
          // 保存 bytecode
          fs.writeFileSync(
            path.join(ROOT, 'output/capture-20080/bytecode-v2.json'),
            JSON.stringify({ bytecode: bytecode, configObj: configObj, bytecodeProp: bytecodeProp, nsd: nsd, cd: cd, timestamp: new Date().toISOString() }, null, 2)
          );
          
          // Step 4: 反编译
          console.log('\n[4] 反编译 bytecode...');
          
          // 如果有操作码表，用它来反编译
          // 否则用通用方法
          
          // 简单反编译：将 bytecode 按操作码分组
          var decompiled = [];
          var pc = 0;
          while (pc < bytecode.length) {
            var op = bytecode[pc];
            decompiled.push({
              pc: pc,
              op: op,
              handler: opcodeMap && opcodeMap[op] ? opcodeMap[op].substring(0, 80) : '(unknown)',
            });
            pc++;
            
            // 某些操作码后面跟操作数
            // 从 handler 代码中判断是否消耗操作数
            // 如果 handler 中有 _$eX[_$mc++] 或类似模式，说明消耗 1 个操作数
          }
          
          console.log('\n  反编译结果（' + decompiled.length + ' 条指令）:');
          decompiled.forEach(function(inst) {
            console.log('  PC=' + inst.pc + ' OP=' + inst.op + ' ' + inst.handler);
          });
        }
      } else {
        console.log('  Bytecode assignment not found in dynamic code');
        console.log('  (bytecode may be generated at runtime)');
      }
    }
  }

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
