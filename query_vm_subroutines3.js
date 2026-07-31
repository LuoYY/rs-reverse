/**
 * query_vm_subroutines3.js — 搜索 _$jv 定义 + 确认子程序 109 = encryptMode1
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
  console.log('=== 搜索 _$jv 定义 ===\n');

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
  if (!dynCode) { console.log('FATAL'); process.exit(1); }
  console.log('Dynamic code:', dynCode.length);

  // 从 pos 283084 附近提取 VM dispatcher 代码
  // 这是最内层 VM（query 生成 VM）
  var queryVMStart = 281000; // 大约位置
  var queryVMEnd = 290000;
  
  // 搜索包含 _\$jv(109 的区域
  var jv109Pos = dynCode.indexOf('_$jv(109');
  if (jv109Pos < 0) {
    // 变量名可能不同，搜索 (109, 模式
    console.log('Searching for (109, pattern...');
    var pos = 0;
    while ((pos = dynCode.indexOf('(109,', pos)) >= 0) {
      var before = dynCode.substring(Math.max(0, pos - 20), pos);
      var after = dynCode.substring(pos, Math.min(dynCode.length, pos + 80));
      console.log('  Found at', pos, ':', before + after);
      pos += 5;
    }
  } else {
    console.log('Found _$jv(109 at pos', jv109Pos);
    var ctx = dynCode.substring(Math.max(0, jv109Pos - 100), Math.min(dynCode.length, jv109Pos + 200));
    console.log('Context:', ctx);
  }

  // 搜索 >> 24（AES 的特征操作）
  console.log('\n[2] 搜索 AES 位操作...');
  var aesOps = ['>>24', '>>16', '>>8', '&255', '<<24', '<<16', '<<8'];
  aesOps.forEach(function(op) {
    var count = 0;
    var pos = 0;
    while ((pos = dynCode.indexOf(op, pos)) >= 0) { count++; pos += op.length; }
    console.log('  "' + op + '":', count, 'times');
  });

  // 搜索 AES S-Box 查找模式
  // AES 的特征：cfgnum[0][x >>> 24] ^ cfgnum[1][(x >> 16) & 255] ^ ...
  console.log('\n[3] 搜索 AES S-Box 查找...');
  var aesPatterns = [
    /\[\s*_\$[a-zA-Z0-9]+\s*>>\s*24\s*\]/,
    /\[\s*_\$[a-zA-Z0-9]+\s*>>\s*16\s*&\s*255\s*\]/,
    /cfgnum/,
    /\^\s*_\$[a-zA-Z0-9]+\[/,
  ];
  
  aesPatterns.forEach(function(pat) {
    var match = pat.exec(dynCode);
    if (match) {
      console.log('  Pattern', pat.source, 'found at pos', match.index);
      var ctx = dynCode.substring(Math.max(0, match.index - 50), Math.min(dynCode.length, match.index + 150));
      console.log('  Context:', ctx.substring(0, 150));
    }
  });

  // 搜索管线的 encryptMode1 中的特征
  // encryptMode1 的核心是 encode 函数
  // encode 函数中有 cfgnum[0][one >>> 24] ^ cfgnum[1][two >> 16 & 255] ^ ...
  // 在动态代码中，cfgnum 可能是某个数组变量
  
  // 搜索 [xxx >>> 24] 模式
  console.log('\n[4] 搜索 >>> 24 模式...');
  var shift24Pattern = />>>\s*24/g;
  var match;
  var count = 0;
  while ((match = shift24Pattern.exec(dynCode)) !== null) {
    count++;
    if (count <= 5) {
      var ctx = dynCode.substring(Math.max(0, match.index - 60), Math.min(dynCode.length, match.index + 60));
      console.log('  pos', match.index, ':', ctx);
    }
  }
  console.log('  Total >>>24:', count);

  // 搜索 >> 24（不带 >>>）
  console.log('\n[5] 搜索 >> 24 模式...');
  var shift24b = />>\s*24/g;
  count = 0;
  while ((match = shift24b.exec(dynCode)) !== null) {
    count++;
    if (count <= 5) {
      var ctx = dynCode.substring(Math.max(0, match.index - 60), Math.min(dynCode.length, match.index + 60));
      console.log('  pos', match.index, ':', ctx);
    }
  }
  console.log('  Total >>24:', count);

  // 搜索管线的 encode 函数特征
  // encode: one = val[0] ^ list[0]
  // 然后循环：cfgnum[0][one >>> 24] ^ cfgnum[1][two >> 16 & 255] ^ ...
  // 这个特征在动态代码中应该存在
  
  // 搜索 ^ 操作的密集区域（XOR 是 AES 的核心）
  console.log('\n[6] 搜索 XOR 密集区域...');
  var xorPattern = /\^/g;
  var xorPositions = [];
  while ((match = xorPattern.exec(dynCode)) !== null) {
    xorPositions.push(match.index);
  }
  console.log('  Total ^ operators:', xorPositions.length);
  
  // 找到 XOR 最密集的 1000 字符区域
  if (xorPositions.length > 10) {
    var bestXorRegion = null;
    var maxXorCount = 0;
    for (var i = 0; i < xorPositions.length; i++) {
      var regionStart = xorPositions[i];
      var regionEnd = regionStart + 1000;
      var xorCount = xorPositions.filter(function(p) { return p >= regionStart && p < regionEnd; }).length;
      if (xorCount > maxXorCount) {
        maxXorCount = xorCount;
        bestXorRegion = regionStart;
      }
    }
    if (bestXorRegion) {
      console.log('  Best XOR region at pos', bestXorRegion, 'with', maxXorCount, '^ operators');
      var xorCode = dynCode.substring(bestXorRegion, bestXorRegion + 500);
      console.log('  Code:', xorCode.substring(0, 300));
      
      // 找到包含这个区域的函数
      var funcStart = dynCode.lastIndexOf('function ', bestXorRegion);
      if (funcStart >= 0 && bestXorRegion - funcStart < 2000) {
        var funcName = dynCode.substring(funcStart, funcStart + 50).match(/function\s+([_$$a-zA-Z0-9]+)/);
        console.log('  In function:', funcName ? funcName[1] : '?', 'at pos', funcStart);
        
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
        
        // 检查是否是 AES encode 函数
        // 特征：包含 ^ 操作 + 数组查找 + 位移
        var hasShift = funcBody.indexOf('>>') >= 0;
        var hasXor = funcBody.indexOf('^') >= 0;
        var hasArray = funcBody.indexOf('[') >= 0;
        console.log('  Has >>:', hasShift, 'Has ^:', hasXor, 'Has []:', hasArray);
        
        if (hasShift && hasXor && hasArray) {
          console.log('\n  ★★★ 可能是 AES encode 函数！ ★★★');
          console.log('  First 500 chars:', funcBody.substring(0, 500));
          
          fs.writeFileSync(
            path.join(ROOT, 'output/capture-20080/possible-aes-encode.js'),
            funcBody
          );
          console.log('  Saved to output/capture-20080/possible-aes-encode.js');
        }
      }
    }
  }

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
