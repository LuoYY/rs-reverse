/**
 * query_vm_subroutines2.js — 在完整动态代码中搜索子程序 109
 *
 * 子程序 109 是加密函数
 * 它不在 VM 操作码 dispatcher 中
 * 它在动态代码的另一个位置
 *
 * 方法：
 * 1. 在完整动态代码中搜索数字 109
 * 2. 搜索可能的子程序表（对象字面量或数组）
 * 3. 搜索函数调用 _$dA 的定义
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
  console.log('=== 搜索子程序 109 实现 ===\n');

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
  RSXHR.prototype = { open: function(mu) { this._url=String(u); this.readyState=1; }, send: function() { this.readyState=4; this.status=200; this.responseText='{}'; },
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

  // 搜索数字 109 在动态代码中的所有出现位置
  console.log('\n[2] 搜索数字 109...');
  
  var searchNum = '109';
  var pos = 0;
  var positions109 = [];
  while ((pos = dynCode.indexOf(searchNum, pos)) >= 0) {
    // 检查前后字符是否是数字（避免匹配 1109, 1091 等）
    var before = pos > 0 ? dynCode[pos - 1] : '';
    var after = dynCode[pos + searchNum.length] || '';
    if (before < '0' || before > '9') {
      if (after < '0' || after > '9') {
        positions109.push(pos);
      }
    }
    pos += searchNum.length;
  }
  
  console.log('  Found 109 at', positions109.length, 'positions');
  positions109.slice(0, 20).forEach(function(p, i) {
    var ctx = dynCode.substring(Math.max(0, p - 30), Math.min(dynCode.length, p + 50));
    console.log('  [' + i + '] pos', p, ':', ctx.replace(/\n/g, '\\n'));
  });

  // 搜索 145
  console.log('\n[3] 搜索数字 145...');
  pos = 0;
  var positions145 = [];
  while ((pos = dynCode.indexOf('145', pos)) >= 0) {
    var before = pos > 0 ? dynCode[pos - 1] : '';
    var after = dynCode[pos + 3] || '';
    if ((before < '0' || before > '9') && (after < '0' || after > '9')) {
      positions145.push(pos);
    }
    pos += 3;
  }
  console.log('  Found 145 at', positions145.length, 'positions');
  positions145.slice(0, 10).forEach(function(p, i) {
    var ctx = dynCode.substring(Math.max(0, p - 30), Math.min(dynCode.length, p + 50));
    console.log('  [' + i + '] pos', p, ':', ctx.replace(/\n/g, '\\n'));
  });

  // 搜索 193
  console.log('\n[4] 搜索数字 193...');
  pos = 0;
  var positions193 = [];
  while ((pos = dynCode.indexOf('193', pos)) >= 0) {
    var before = pos > 0 ? dynCode[pos - 1] : '';
    var after = dynCode[pos + 3] || '';
    if ((before < '0' || before > '9') && (after < '0' || after > '9')) {
      positions193.push(pos);
    }
    pos += 3;
  }
  console.log('  Found 193 at', positions193.length, 'positions');
  positions193.slice(0, 10).forEach(function(p, i) {
    var ctx = dynCode.substring(Math.max(0, p - 30), Math.min(dynCode.length, p + 50));
    console.log('  [' + i + '] pos', p, ':', ctx.replace(/\n/g, '\\n'));
  });

  // 搜索子程序表（对象字面量）
  // 格式可能：{109: function(){...}, 145: function(){...}, ...}
  // 或：[_$fn0, _$fn1, ..., _$fn109, ...]
  console.log('\n[5] 搜索子程序表...');
  
  // 搜索 {109: 或 [109] 或 109:function
  var tablePatterns = [
    /\{109\s*:/,
    /\[109\]/,
    /109\s*:\s*function/,
    /109\s*:\s*\(/,
  ];
  
  tablePatterns.forEach(function(pat) {
    var match = pat.exec(dynCode);
    if (match) {
      console.log('  Found pattern', pat.source, 'at pos', match.index);
      var ctx = dynCode.substring(Math.max(0, match.index - 50), Math.min(dynCode.length, match.index + 200));
      console.log('  Context:', ctx.substring(0, 200));
    }
  });

  // 搜索子程序调用函数 _$dA
  // _$dA 可能是动态代码中定义的函数
  // 它的特征：接受第一个参数作为子程序编号
  // 然后调用对应的函数
  console.log('\n[6] 搜索子程序调用函数...');
  
  // 搜索 function _$xx(_$yy,_) 模式（第一个参数是编号）
  // 或 function _$xx(_$yy,_$zz,_$aa,_$bb) 模式
  // 然后内部有 switch 或 if 判断第一个参数
  
  // 更直接的方法：搜索包含 109 和 145 的函数体
  if (positions109.length > 0 && positions145.length > 0) {
    // 找到同时包含 109 和 145 的代码区域
    for (var i = 0; i < positions109.length; i++) {
      for (var j = 0; j < positions145.length; j++) {
        var dist = Math.abs(positions109[i] - positions145[j]);
        if (dist < 5000) {
          console.log('  109 at', positions109[i], 'and 145 at', positions145[j], '(dist:', dist + ')');
          var region = dynCode.substring(
            Math.min(positions109[i], positions145[j]) - 200,
            Math.max(positions109[i], positions145[j]) + 200
          );
          // 检查这个区域是否在函数定义内
          var funcStart = region.lastIndexOf('function ');
          if (funcStart >= 0) {
            console.log('  In function starting at:', funcStart);
            console.log('  Function context:', region.substring(funcStart, funcStart + 200));
          }
        }
      }
    }
  }

  // 最终方法：直接搜索加密函数特征
  // encryptMode1 的特征：包含 S-Box 查找、XOR、移位操作
  console.log('\n[7] 搜索加密函数特征...');
  
  // 搜索 AES 特征：>>> 24（右移24位）
  var aesPattern = />>>\s*24/g;
  var aesMatches = [];
  var aesMatch;
  while ((aesMatch = aesPattern.exec(dynCode)) !== null) {
    aesMatches.push(aesMatch.index);
  }
  console.log('  >>>24 found:', aesMatches.length, 'times');
  
  if (aesMatches.length > 0) {
    // 找到包含最多 >>>24 的区域（最可能是 AES 函数）
    var bestRegion = null;
    var maxCount = 0;
    
    for (var i = 0; i < aesMatches.length; i++) {
      var start = aesMatches[i] - 500;
      var end = aesMatches[i] + 500;
      var count = aesMatches.filter(function(p) { return p >= start && p <= end; }).length;
      if (count > maxCount) {
        maxCount = count;
        bestRegion = { start: start, end: end, count: count };
      }
    }
    
    if (bestRegion) {
      console.log('  Best AES region:', maxCount, '>>>24 in region');
      var aesCode = dynCode.substring(bestRegion.start, bestRegion.end);
      
      // 找到包含这个区域的函数
      var funcStart = dynCode.lastIndexOf('function ', bestRegion.start);
      if (funcStart >= 0 && bestRegion.start - funcStart < 2000) {
        var funcName = dynCode.substring(funcStart, funcStart + 50).match(/function\s+([_$$a-zA-Z0-9]+)/);
        console.log('  AES function:', funcName ? funcName[1] : 'anonymous', 'at pos', funcStart);
        
        // 提取函数体
        var bracePos = dynCode.indexOf('{', funcStart);
        var depth = 0;
        var funcEnd = bracePos;
        for (var fi = bracePos; fi < dynCode.length; fi++) {
          if (dynCode[fi] === '{') depth++;
          else if (dynCode[fi] === '}') { depth--; if (depth === 0) { funcEnd = fi; break; } }
        }
        var funcBody = dynCode.substring(funcStart, funcEnd + 1);
        console.log('  Function length:', funcBody.length);
        console.log('  First 300 chars:', funcBody.substring(0, 300));
        
        // 保存
        fs.writeFileSync(
          path.join(ROOT, 'output/capture-20080/aes-function.js'),
          funcBody
        );
        console.log('  Saved to output/capture-20080/aes-function.js');
      }
    }
  }

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
