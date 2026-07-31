/**
 * query_fix_v13.js — 直接在 trampoline toString 代码中分析
 * 
 * 从 v12 发现：execMatch 为 null，说明 trampoline 代码格式不匹配
 * 需要更灵活地解析 trampoline 代码
 *
 * 从 v11 的 trampoline toString：
 * function _$eY(){
 *   var _$eY,_$_o,_$ex,_$_Q,_$du,_$_4;
 *   if(_$jv._$cg)
 *     (_$_o=_$cv._$cK(), _$eY=_$cv._$cK(), _$_o[1]=_$l8[1], _$_o[3]=_$l8[3]);
 *   else{
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
 *   _$bh(_$jv, 0, _$jv._$hK.length, _$_o),
 *   _$du=_$_o[4], _$_4=_$_o[5],
 *   _$jv._$cg ? (_$cv._$aI(_$_o), _$cv._$aI(_$eY)) : 0;
 *   if(_$du===1) return _$_4;
 * }
 *
 * 关键变量名每次会话不同，但结构相同
 * 需要从 toString 中动态提取变量名
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
  console.log('=== trampoline 动态变量名提取 v13 ===\n');

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

  // Step 1: 获取 trampoline 代码
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
  console.log('Trampoline code:\n', trampStr);
  
  // 从 trampoline 代码中动态提取所有关键变量名
  // 1. 配置对象名: if(XXX.YYY) → XXX=配置对象, YYY=条件属性
  var configMatch = trampStr.match(/if\((_[$a-zA-Z0-9]+)\.(_[$a-zA-Z0-9]+)\)/);
  var configObj = configMatch ? configMatch[1] : null;
  var configProp = configMatch ? configMatch[2] : null;
  console.log('\nConfig object:', configObj);
  console.log('Config condition prop:', configProp);
  
  // 2. VM 执行函数和参数: XXX(YYY,0,YYY.ZZZ.length,WWW)
  // 更宽松的匹配
  var vmExecMatch = trampStr.match(/(_[$a-zA-Z0-9]+)\((_[$a-zA-Z0-9]+),0,(_[$a-zA-Z0-9]+)\.(_[$a-zA-Z0-9]+)\.length,(_[$a-zA-Z0-9]+)\)/);
  if (vmExecMatch) {
    console.log('\nVM exec fn:', vmExecMatch[1]);
    console.log('VM target:', vmExecMatch[2]);
    console.log('VM bytecode obj:', vmExecMatch[3]);
    console.log('VM bytecode prop:', vmExecMatch[4]);
    console.log('VM args array:', vmExecMatch[5]);
  } else {
    console.log('\nVM exec pattern not found, trying alternative...');
    // 搜索包含 .length 的调用
    var altMatch = trampStr.match(/(_[$a-zA-Z0-9]+)\((_[$a-zA-Z0-9]+),[0-9]+,.*?\.length,(_[$a-zA-Z0-9]+)\)/);
    if (altMatch) {
      console.log('Alt VM exec fn:', altMatch[1]);
      console.log('Alt VM args array:', altMatch[3]);
    }
  }
  
  // 3. exit code 和 return value: XXX=YYY[4],ZZZ=YYY[5]
  var exitMatch = trampStr.match(/(_[$a-zA-Z0-9]+)=(_[$a-zA-Z0-9]+)\[4\],(_[$a-zA-Z0-9]+)=(_[$a-zA-Z0-9]+)\[5\]/);
  if (exitMatch) {
    console.log('\nExit code:', exitMatch[1] + '=' + exitMatch[2] + '[4]');
    console.log('Return value:', exitMatch[3] + '=' + exitMatch[4] + '[5]');
    console.log('Args array (from exit):', exitMatch[2]);
  }

  // Step 2: 在动态代码中找到 trampoline 函数定义并插入导出
  if (trampFuncName) {
    var escapedName = trampFuncName.replace(/\$/g, '\\$');
    var funcRegex = new RegExp('function\\s+' + escapedName + '\\s*\\([^)]*\\)\\s*\\{', 'g');
    var funcMatch = funcRegex.exec(dynCode);
    if (funcMatch) {
      console.log('\nFound trampoline at pos', funcMatch.index);
      
      // 提取函数体
      var funcBodyStart = funcMatch.index + funcMatch[0].length;
      var depth = 1;
      var funcBodyEnd = funcBodyStart;
      for (var fi = funcBodyStart; fi < dynCode.length; fi++) {
        if (dynCode[fi] === '{') depth++;
        else if (dynCode[fi] === '}') { depth--; if (depth === 0) { funcBodyEnd = fi; break; } }
      }
      var funcBody = dynCode.substring(funcBodyStart, funcBodyEnd);
      console.log('Function body length:', funcBody.length);
      
      // 在函数体中找到 if(xxx===1) return yyy; 的位置
      // 这是最后一个语句
      var returnMatch = funcBody.match(/if\((_[$a-zA-Z0-9]+)===1\)return\s+(_[$a-zA-Z0-9]+)/);
      if (returnMatch) {
        console.log('\nReturn condition:', returnMatch[1] + '===1');
        console.log('Return value:', returnMatch[2]);
        
        // 在 return 语句前插入导出
        var returnPos = funcBody.indexOf('if(' + returnMatch[1] + '===1)');
        if (returnPos >= 0) {
          var absInsertPos = funcBodyStart + returnPos;
          
          // 导出代码
          var argsArr = exitMatch ? exitMatch[2] : '_$_o'; // 默认值
          var exportCode = 'try{window.__vm={exitCode:' + argsArr + '[4],returnValue:' + argsArr + '[5],returnValueType:typeof ' + argsArr + '[5],returnValueLen:(typeof ' + argsArr + '[5]==="string")?' + argsArr + '[5].length:-1';
          // 也导出配置对象
          if (configObj) {
            exportCode += ',' + configObj + '_cg:' + configObj + '.' + (configProp || '_$cg');
          }
          exportCode += '};}catch(_$e){window.__vm_err=_$e.message;}';
          
          var patched = dynCode.substring(0, absInsertPos) + exportCode + dynCode.substring(absInsertPos);
          console.log('Inserted export at pos', absInsertPos);
          
          // Step 3: 执行
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

          // 触发
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
          var vmType = vm.runInContext('typeof window.__vm', env3.proxied);
          console.log('\n__vm type:', vmType);
          if (vmType !== 'undefined') {
            var vmStr = vm.runInContext('JSON.stringify(window.__vm, function(k,v){if(typeof v==="function")return"[fn]";if(typeof v==="string"&&v.length>200)return v.substring(0,200)+"...";return v;}, 2)', env3.proxied);
            console.log('VM result:', vmStr);
          }
          var vmErr = vm.runInContext('window.__vm_err || null', env3.proxied);
          if (vmErr) console.log('VM error:', vmErr);
        }
      } else {
        console.log('Return pattern not found in function body');
        console.log('Function body (last 200):', funcBody.substring(funcBody.length - 200));
      }
    } else {
      console.log('Trampoline function not found in dynamic code');
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
