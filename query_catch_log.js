/**
 * query_catch_log.js — 在 catch 块中添加 error logging
 * 找到导致 exit code = 2 的异常
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== Catch 块 error logging ===\n');

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

  // Pass 1: 获取动态代码
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

  // Patch: 在所有 catch 块中添加 error logging
  // 模式: catch(_$xx){ → catch(_$xx){if(!window.__ce)window.__ce=[];window.__ce.push(_$xx&&_$xx.message?_$xx.message.substring(0,80):String(_$xx).substring(0,80));
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched = dynCode;
  var match;
  var patchCount = 0;
  var offset = 0;
  
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset;
    var insert = 'if(!window.__ce)window.__ce=[];window.__ce.push(' + errVar + '&&' + errVar + '.message?' + errVar + '.message.substring(0,80):String(' + errVar + ').substring(0,80));';
    patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
    offset += insert.length;
    patchCount++;
  }
  
  console.log('Patched', patchCount, 'catch blocks');

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
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 2000));

  // 清空 catch log
  vm.runInContext('window.__ce = []', env2.proxied);

  // 触发 trampoline
  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  if (tramp) {
    const result = tramp.call(xhr, '{}');
    console.log('\nTrampoline result: "' + String(result).substring(0, 40) + '"');

    // 检查 catch 日志
    const catches = vm.runInContext('window.__ce || []', env2.proxied);
    console.log('\n=== Catch logs: ' + catches.length + ' ===');
    
    // 去重
    const unique = [...new Set(catches)];
    console.log('Unique:', unique.length);
    unique.slice(0, 30).forEach((e, i) => console.log('  [' + i + '] ' + e));
    
    if (catches.length === 0) {
      console.log('\nNo catches triggered!');
      console.log('VM exit code = 2 is NOT caused by catch block');
      console.log('args[5]="" is set by normal VM logic (not exception)');
    } else {
      console.log('\n=== 分析 ===');
      console.log('Catch logs show exceptions during trampoline execution');
      console.log('These exceptions cause VM to set args[5]=""');
      console.log('Fix these exceptions → VM generates query');
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
