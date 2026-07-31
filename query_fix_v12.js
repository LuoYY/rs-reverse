/**
 * query_fix_v12.js — 在 trampoline 内部正确位置插入导出
 *
 * 从 v11 发现：
 * 1. trampoline 函数 _$eY 在动态代码 pos 15482 找到
 * 2. 但导出代码插入后 __tramp_vars 仍然是 undefined
 * 3. 这说明导出代码在 trampoline 被调用前就执行了，但 _$jv 此时可能未定义
 *    或者导出代码的位置不对
 *
 * trampoline 代码分析：
 * function _$eY(){
 *   var _$eY,_$_o,_$ex,_$_Q,_$du,_$_4;
 *   if(_$jv._$cg)  // _$jv._$cg 是条件标志
 *     (_$_o=_$cv._$cK(), _$eY=_$cv._$cK(), ...);
 *   else {
 *     _$_o=[], _$eY=new _$k1(_$jv._$gm),
 *     _$_o[1]=_$l8[1].concat([arguments]),
 *     _$_o[3]=_$l8[3].concat([_$eY]),
 *     _$ex=_$jv._$h3;
 *     for(_$_Q=2;_$_Q<_$ex.length;_$_Q++)
 *       _$eY[_$_Q]=_$d5(_$ex[_$_Q],_$_o);
 *   }
 *   _$_o[0]=arguments, _$_o[2]=_$eY,
 *   _$eY[0]=this, _$eY[1]=arguments,
 *   _$jv._$hK.charCodeAt ? _$jv._$hK=_$dT(_$jv._$hK) : 0,
 *   _$bh(_$jv, 0, _$jv._$hK.length, _$_o),  // ← 执行 VM
 *   _$du=_$_o[4], _$_4=_$_o[5],  // ← 取返回值
 *   _$jv._$cg ? (_$cv._$aI(_$_o), _$cv._$aI(_$eY)) : 0;
 *   if(_$du===1) return _$_4;  // ← 只有 exit code=1 才返回
 * }
 *
 * 关键：_$du=_$_o[4] 是 VM exit code
 * 如果 exit code !== 1，函数不返回任何值 → 返回 undefined → trampoline 返回 ""
 * 
 * 但从 v9 的测试中，trampoline 返回 ""（不是 undefined）
 * 说明 exit code=1，但 _$_4=_$_o[5]="" 
 * 或者 exit code !== 1，函数返回 undefined → String(undefined) → 某处转为 ""
 *
 * 方法：在 trampoline 的 _$bh 调用后插入 _$_o[4] 和 _$_o[5] 的导出
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

function makeAnchorEl() {
  var el = { tagName: 'A', nodeName: 'A', nodeType: 1, style: new Proxy({}, { get: () => '', set: () => true }), children: [], childNodes: [],
    setAttribute: function(name, val) { if (name === 'href') this.href = String(val); },
    getAttribute: function(name) { if (name === 'href') return this._href || ''; return null; },
    removeAttribute() {}, appendChild(c) { return c; }, removeChild(c) { return c; },
    addEventListener() {}, removeEventListener() {}, _href: '', _url: null };
  Object.defineProperty(el, 'href', { get: function() { return this._href; }, set: function(v) { this._href = String(v);
    try { var b = 'https://pmos.xj.sgcc.com.cn:20080'; try { this._url = new URL(this._href, b); } catch(e) { this._url = { href: this._href, protocol: '', host: '', hostname: '', port: '', pathname: this._href, search: '', hash: '', origin: b }; } } catch(e) { this._url = null; } }, configurable: true });
  ['protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'origin', 'username', 'password'].forEach(function(p) {
    Object.defineProperty(el, p, { get: function() { return this._url ? (this._url[p] || '') : ''; }, set: function(){}, configurable: true }); });
  el.innerHTML=''; el.innerText=''; el.textContent=''; el.className=''; el.id=''; el.clientWidth=0; el.clientHeight=0; el.offsetWidth=0; el.offsetHeight=0;
  el.getBoundingClientRect=function(){return{top:0,left:0,right:0,bottom:0,width:0,height:0};}; el.getElementsByTagName=function(){return[];}; el.querySelector=function(){return null;}; el.querySelectorAll=function(){return[];};
  el.cloneNode=function(){return makeAnchorEl();}; el.remove=function(){}; el.parentNode=null; el.parentElement=null; el.firstChild=null; el.lastChild=null; el.nextSibling=null;
  return el;
}

(async () => {
  console.log('=== trampoline VM exit code 分析 v12 ===\n');

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
  RSXHR.prototype = { open: function(m,u) { this._url=String(u); this.readyState=1; }, send: function() { this.readyState=4; this.status=200; this.responseText='{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {}, getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {}, readyState:0, status:0, responseText:'', responseURL:'' };
  env1.sandbox.XMLHttpRequest = RSXHR;
  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  if (!dynCode) { console.log('FATAL: dynCode not captured'); process.exit(1); }
  console.log('Dynamic code:', dynCode.length, 'bytes');

  // Step 1: 获取 trampoline 函数名
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  env2.sandbox.document.createElement = function(tag) {
    if (String(tag).toLowerCase() === 'a') return makeAnchorEl();
    return env2.sandbox.document.createElement.call(this, tag);
  };
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
    if (typeof code === 'string' && code.length > 50000 && !done1) { done1 = true; return origEval2.call(this, code); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  var xhr1 = new RSXHR2();
  RSXHR2.prototype.open.call(xhr1, 'POST', '/test', true);
  var trampName = null;
  for (var k in xhr1) { if (k.startsWith('_$') && typeof xhr1[k] === 'function') { trampName = k; break; } }
  if (!trampName) { console.log('No trampoline'); process.exit(0); }
  
  var trampStr = xhr1[trampName].toString();
  var trampFuncMatch = trampStr.match(/function\s+([_$$a-zA-Z0-9]+)/);
  var trampFuncName = trampFuncMatch ? trampFuncMatch[1] : null;
  console.log('Trampoline function:', trampFuncName);
  
  // 从 trampoline 代码中提取关键变量名
  // 模式：_$XX(_$YY,0,_$YY._$ZZ.length,_$_o) → VM 执行函数
  // 然后 _$du=_$_o[4], _$_4=_$_o[5]
  var vmExecMatch = trampStr.match(/(\S+)\((\S+),0,(\S+)\._\S+\.length,(\S+)\)/);
  if (!vmExecMatch) {
    // 尝试更宽松的匹配
    vmExecMatch = trampStr.match(/(_\\$\\S+)\\((_\\$\\S+),0,(_\\$\\S+)\\.(_\\$\\S+)\\.length,(_\\$\\S+)\\)/);
  }
  
  // 直接从 trampolineStr 提取
  // 格式：_$bh(_$jv,0,_$jv._$hK.length,_$_o)
  var execPattern = /(_\$[a-zA-Z0-9]+)\((_$[a-zA-Z0-9]+),0,(_$[a-zA-Z0-9]+)\.(_$[a-zA-Z0-9]+)\.length,(_$[a-zA-Z0-9]+)\)/;
  var execMatch = trampStr.match(execPattern);
  if (execMatch) {
    console.log('VM exec function:', execMatch[1]);
    console.log('VM exec target:', execMatch[2]);
    console.log('VM bytecode obj:', execMatch[3]);
    console.log('VM bytecode prop:', execMatch[4]);
    console.log('VM args array:', execMatch[5]);
  }
  
  // 提取 exit code 和 return value 变量
  // 格式：_$du=_$_o[4],_$_4=_$_o[5]
  var exitPattern = /(_$[a-zA-Z0-9]+)=(_$[a-zA-Z0-9]+)\[4\],(_$[a-zA-Z0-9]+)=(_$[a-zA-Z0-9]+)\[5\]/;
  var exitMatch = trampStr.match(exitPattern);
  if (exitMatch) {
    console.log('\nExit code var:', exitMatch[1], '=', exitMatch[2] + '[4]');
    console.log('Return value var:', exitMatch[3], '=', exitMatch[4] + '[5]');
  }

  // 提取条件变量
  // 格式：if(_$jv._$cg)
  var condPattern = /if\((_\\$[a-zA-Z0-9]+)\.(_\\$[a-zA-Z0-9]+)\)/;
  var condMatch = trampStr.match(condPattern);
  if (condMatch) {
    console.log('\nCondition obj:', condMatch[1]);
    console.log('Condition prop:', condMatch[2]);
  }

  // Step 2: 在 trampoline 的 VM 执行后插入导出
  // 在动态代码中找到 trampoline 定义
  if (trampFuncName) {
    var escapedName = trampFuncName.replace(/\$/g, '\\$');
    var funcRegex = new RegExp('function\\s+' + escapedName + '\\s*\\([^)]*\\)\\s*\\{', 'g');
    var funcMatch = funcRegex.exec(dynCode);
    if (funcMatch) {
      console.log('\nFound trampoline at pos', funcMatch.index);
      
      // 在函数体中找到 VM 执行调用的位置
      // 搜索 execMatch[1](
      if (execMatch) {
        var execFn = execMatch[1];
        var escapedExecFn = execFn.replace(/\$/g, '\\$');
        // 在 trampoline 函数体范围内搜索
        var funcBodyStart = funcMatch.index + funcMatch[0].length;
        var funcBodyEnd = dynCode.indexOf('}', funcBodyStart);
        // 找到匹配的结束大括号
        var depth = 1;
        for (var fi = funcBodyStart; fi < dynCode.length; fi++) {
          if (dynCode[fi] === '{') depth++;
          else if (dynCode[fi] === '}') { depth--; if (depth === 0) { funcBodyEnd = fi; break; } }
        }
        var funcBody = dynCode.substring(funcBodyStart, funcBodyEnd);
        
        // 在函数体中搜索 VM 执行调用
        var execInBody = new RegExp(escapedExecFn + '\\(', 'g');
        var execPos = execInBody.exec(funcBody);
        if (execPos) {
          // 找到这个调用的结束分号
          var semicolonPos = funcBody.indexOf(';', execPos.index);
          if (semicolonPos > 0) {
            var absInsertPos = funcBodyStart + semicolonPos + 1;
            
            // 插入导出代码
            var argsArr = execMatch[5]; // _$_o
            var escapedArgs = argsArr.replace(/\$/g, '\\$');
            var exportCode = 'try{window.__vm_result={exitCode:' + argsArr + '[4],returnValue:' + argsArr + '[5],returnValueType:typeof ' + argsArr + '[5],returnValueLen:(typeof ' + argsArr + '[5]==="string")?' + argsArr + '[5].length:-1,args0:' + argsArr + '[0],args1:' + argsArr + '[1],args2:' + argsArr + '[2],args3:' + argsArr + '[3]};}catch(_$e){try{window.__vm_err=_$e.message;}catch(_$ign){}}';
            
            var patched = dynCode.substring(0, absInsertPos) + exportCode + dynCode.substring(absInsertPos);
            console.log('Inserted VM result export at pos', absInsertPos);
            
            // Step 3: 执行 patched
            const env3 = buildEnv({ nsd, cd }, { seedCookie });
            env3.sandbox.document.createElement = function(tag) {
              if (String(tag).toLowerCase() === 'a') return makeAnchorEl();
              return env3.sandbox.document.createElement.call(this, tag);
            };
            env3.sandbox.document = new Proxy(env3.sandbox.document, {
              get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
              set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
            });
            function RSXHR3() {}
            RSXHR3.prototype = {};
            for (const key in RSXHR.prototype) RSXHR3.prototype[key] = RSXHR.prototype[key];
            env3.sandbox.XMLHttpRequest = RSXHR3;

            const origEval3 = env3.sandbox.eval;
            let done2 = false;
            env3.sandbox.eval = function(code) {
              if (typeof code === 'string' && code.length > 50000 && !done2) { done2 = true; return origEval3.call(this, code); }
              return origEval3.call(this, code);
            };
            try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env3.proxied, { timeout: 30000 }); } catch(e) {}
            await new Promise(r => setTimeout(r, 2000));

            // 触发 trampoline
            var xhr2 = new RSXHR3();
            RSXHR3.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
            for (var k2 in xhr2) { if (k2.startsWith('_$') && typeof xhr2[k2] === 'boolean') xhr2[k2] = true; }
            var tramp2 = null;
            for (var k2 in xhr2) { if (k2.startsWith('_$') && typeof xhr2[k2] === 'function') { tramp2 = xhr2[k2]; break; } }
            if (tramp2) {
              var result = '';
              try { result = tramp2.call(xhr2, '{}') || ''; } catch(e) { console.log('Threw:', e.message); }
              console.log('\nResult:', JSON.stringify(result.substring(0, 80)));
              console.log('Length:', result.length);
            }
            
            // 检查 VM 结果
            var vmResultType = vm.runInContext('typeof window.__vm_result', env3.proxied);
            console.log('\n__vm_result type:', vmResultType);
            
            if (vmResultType !== 'undefined') {
              var vmResult = vm.runInContext('JSON.stringify(window.__vm_result, function(key,val){if(typeof val==="function")return"[fn]";if(val&&typeof val==="object"&&val instanceof Array)return"[array:"+val.length+"]";if(typeof val==="string"&&val.length>200)return val.substring(0,200)+"...";return val;}, 2)', env3.proxied);
              console.log('\nVM result:');
              console.log(vmResult);
            }
            
            var vmErr = vm.runInContext('window.__vm_err || null', env3.proxied);
            if (vmErr) console.log('\nVM error:', vmErr);
          }
        }
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
