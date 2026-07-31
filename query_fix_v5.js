/**
 * query_fix_v5.js — 精确定位 charAt 异常的 null 值来源
 *
 * 从 v4 的关键发现：
 * _$_d 函数解析 URL，出错位置：
 * _$cd[56][_$gE[52]](_$i2[_$$e],0) !== _$an
 * → _$cd[56] 是 String.prototype 或类似
 * → _$gE[52] 是 'charAt' 或 'indexOf'
 * → _$i2 是 URL 解析对象（类似 <a> 元素）
 * → _$$e 是属性索引（可能是 'search' 或 'hash'）
 * → _$i2[_$$e] 是 null/undefined！
 *
 * _$i2 是通过 _$hi[_$gE[56]](_$gE[49]) 创建的
 * → _$hi 可能是 document
 * → _$gE[56] 可能是 'createElement'
 * → _$gE[49] 可能是 'a'
 * → 所以 _$i2 = document.createElement('a')
 * → _$i2.href = url → 浏览器自动解析 URL 部分
 * → _$i2.search / _$i2.hash / _$i2.protocol 等
 *
 * 问题：我们的 createElement('a') 返回的 stub 没有 search/hash/protocol 等属性！
 * 当 RS 设置 _$i2.href = url 后，浏览器自动解析，
 * 但我们的 stub 不会自动解析，所以 _$i2.search 等是 undefined
 *
 * 修复：给 createElement('a') 返回一个带 URL 解析能力的 stub
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

// 创建带 URL 解析的 <a> 元素 stub
function makeAnchorEl() {
  var el = {
    tagName: 'A', nodeName: 'A', nodeType: 1,
    style: new Proxy({}, { get: () => '', set: () => true }),
    children: [], childNodes: [],
    setAttribute: function(name, val) {
      if (name === 'href') this.href = String(val);
    },
    getAttribute: function(name) {
      if (name === 'href') return this._href || '';
      return null;
    },
    removeAttribute() {},
    appendChild(c) { return c; }, removeChild(c) { return c; },
    addEventListener() {}, removeEventListener() {},
    // URL 解析属性 — 用 Node.js URL 来解析
    _href: '',
    _url: null,
  };
  
  // 用 getter/setter 实现 href 自动解析
  Object.defineProperty(el, 'href', {
    get: function() { return this._href; },
    set: function(v) {
      this._href = String(v);
      try {
        // 尝试解析为完整 URL
        var base = 'https://pmos.xj.sgcc.com.cn:20080';
        var parsed;
        try {
          parsed = new URL(this._href, base);
        } catch(e) {
          // 如果 URL 解析失败，创建一个模拟对象
          parsed = { href: this._href, protocol: '', host: '', hostname: '', port: '', pathname: this._href, search: '', hash: '', origin: base };
        }
        this._url = parsed;
      } catch(e) {
        this._url = null;
      }
    },
    configurable: true,
  });
  
  // URL 属性代理
  var urlProps = ['protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'origin', 'username', 'password'];
  urlProps.forEach(function(prop) {
    Object.defineProperty(el, prop, {
      get: function() {
        if (this._url) return this._url[prop] || '';
        return '';
      },
      set: function() {},
      configurable: true,
    });
  });
  
  // 其他 DOM 属性
  el.innerHTML = '';
  el.innerText = '';
  el.textContent = '';
  el.className = '';
  el.id = '';
  el.clientWidth = 0;
  el.clientHeight = 0;
  el.offsetWidth = 0;
  el.offsetHeight = 0;
  el.getBoundingClientRect = function() { return { top:0, left:0, right:0, bottom:0, width:0, height:0 }; };
  el.getElementsByTagName = function() { return []; };
  el.querySelector = function() { return null; };
  el.querySelectorAll = function() { return []; };
  el.cloneNode = function() { return makeAnchorEl(); };
  el.remove = function() {};
  el.parentNode = null;
  el.parentElement = null;
  el.firstChild = null;
  el.lastChild = null;
  el.nextSibling = null;
  
  return el;
}

(async () => {
  console.log('=== 修复 createElement("a") URL 解析 v5 ===\n');

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

  // Patch catch blocks
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

  // 构建增强沙箱：createElement('a') 返回 URL 解析 stub
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  
  // 替换 createElement
  var origCreateElement = env2.sandbox.document.createElement;
  env2.sandbox.document.createElement = function(tag) {
    if (String(tag).toLowerCase() === 'a') {
      return makeAnchorEl();
    }
    return origCreateElement.call(this, tag);
  };
  
  // Proxy document
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  env2.sandbox.XMLHttpRequest = RSXHR2;

  // 执行
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
  console.log('\n[Step] 触发 trampoline...');
  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  if (tramp) {
    var result = '';
    try { result = tramp.call(xhr, '{}') || ''; } catch(e) { console.log('Threw:', e.message); }
    console.log('Result: "' + String(result).substring(0, 80) + '" (length:', typeof result === 'string' ? result.length : 0, ')');

    var catches = vm.runInContext('window.__ce || []', env2.proxied);
    console.log('\nCatches:', catches.length);
    var seen = new Set();
    catches.forEach(function(c) {
      if (seen.has(c.msg)) return;
      seen.add(c.msg);
      console.log('  -', c.msg.substring(0, 100));
    });
    
    if (result && result.length > 10) {
      console.log('\n*** QUERY CAPTURED! ***');
      console.log('Query:', result);
      fs.writeFileSync(
        path.join(ROOT, 'output/capture-20080/query-captured.json'),
        JSON.stringify({ query: result, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
      );
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
